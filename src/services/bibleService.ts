
import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { Verse, SearchResult } from "../types";
import { bibleDb } from "./bibleDb";

// Use process.env.API_KEY exclusively as per guidelines
// Fallback to 'MISSING_KEY' to prevent white screen crash if env var is not set
const API_KEY = process.env.API_KEY || 'MISSING_KEY';
const ai = new GoogleGenAI({ apiKey: API_KEY });

// Simple in-memory cache
const CACHE = new Map<string, Verse[]>();

async function withRetry<T>(operation: () => Promise<T>, retries = 2, baseDelay = 1000): Promise<T> {
  let lastError: any;
  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      const errorMessage = error.message || '';
      const errorStatus = error.status || '';

      // Handle Expired Key specifically
      if (errorMessage.includes('expired')) {
        throw new Error("API Key 已過期 (Expired)。請前往 Google AI Studio 申請新金鑰，並在 Vercel 重新部署 (Redeploy)。");
      }

      // Handle Leaked/Blocked Key (403)
      if (errorMessage.includes('leaked') || errorMessage.includes('403') || errorStatus === 'PERMISSION_DENIED') {
         throw new Error("API Key 已被 Google 封鎖 (偵測到外洩)。請更換金鑰並重新部署。");
      }

      // If it's a 429 (Quota Exceeded), do not retry, fail immediately with specific message
      if (errorMessage.includes('429') || errorStatus === 'RESOURCE_EXHAUSTED' || errorMessage.includes('quota')) {
        throw new Error("AI 配額已滿 (Quota Exceeded)。請使用「設定」匯入離線聖經檔案，即可完全免費用。");
      }
      
      // Handle missing key error specifically
      if (API_KEY === 'MISSING_KEY' || errorMessage.includes('API key') || errorMessage.includes('400') || errorStatus === 'INVALID_ARGUMENT') {
         throw new Error("API Key 無效。請檢查 Vercel 環境變數 VITE_API_KEY 是否正確，並務必執行 Redeploy。");
      }

      console.warn(`Attempt ${i + 1} failed:`, errorMessage);
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, baseDelay * Math.pow(2, i)));
      }
    }
  }
  throw lastError;
}

// Utility to reliably extract JSON from potential markdown text or malformed AI output
function extractJSON(text: string, mode: 'verses' | 'search' = 'verses'): any {
  if (!text) throw new Error("Empty response from AI");

  // PRE-PROCESSING: Fix the specific "1.00000..." infinite float bug
  // This replaces "verse": 1.00000... with "verse": 1
  let sanitizedText = text.replace(/"verse"\s*:\s*(\d+)\.0+/g, '"verse": $1');
  sanitizedText = sanitizedText.replace(/"chapter"\s*:\s*(\d+)\.0+/g, '"chapter": $1');
  
  // Also remove huge numbers that might break JSON (e.g. infinite repeating digits)
  sanitizedText = sanitizedText.replace(/:\s*(\d{15,})/g, ': $1'); 

  // 1. Try direct parse first
  try {
    return JSON.parse(sanitizedText);
  } catch (e) {
    // Continue
  }

  // 2. Remove Markdown code blocks (```json ... ```)
  let cleaned = sanitizedText.replace(/```json\s*|```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // Continue
  }

  // 3. Extract purely by brace finding (Find largest outer object)
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  
  if (firstBrace !== -1 && lastBrace !== -1) {
    const candidate = cleaned.substring(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch (e) {
      // Continue
    }
    
    // 4. Try to sanitize common trailing comma issues
    try {
        const sanitized = candidate.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
        return JSON.parse(sanitized);
    } catch (e) {
        // Continue
    }
  }

  // 5. Fallback: Check if it's an array wrapped in text (Specific for verses)
  const firstBracket = cleaned.indexOf('[');
  const lastBracket = cleaned.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1) {
     const candidate = cleaned.substring(firstBracket, lastBracket + 1);
     try {
         const arr = JSON.parse(candidate);
         return mode === 'verses' ? { verses: arr } : { results: arr }; 
     } catch (e) {}
  }

  // 6. Last resort: Regex extraction (Only for verses mode to avoid messing up complex search objects)
  if (mode === 'verses') {
      try {
        const verses: any[] = [];
        const regex = /"verse"\s*:\s*"?(\d+)(\.0+)?"?\s*,\s*"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
        
        let match;
        while ((match = regex.exec(sanitizedText)) !== null) {
          verses.push({
            verse: parseInt(match[1], 10),
            text: match[3]
          });
        }
        
        if (verses.length > 0) {
          verses.sort((a, b) => a.verse - b.verse);
          return { verses };
        }
      } catch (e) {
        console.warn("Regex fallback failed", e);
      }
  }

  console.error("Failed to parse JSON content:", text.substring(0, 200) + "...");
  throw new Error("AI 資料格式錯誤，請重試或使用離線模式。");
}

export const getChapterContent = async (bookNameEng: string, bookNameChi: string, chapter: number): Promise<Verse[]> => {
  const cacheKey = `${bookNameEng}-${chapter}`;
  
  if (CACHE.has(cacheKey)) return CACHE.get(cacheKey)!;

  // 1. Local DB (Highest Priority & Speed)
  try {
    const localVerses = await bibleDb.getChapter(bookNameChi, chapter);
    if (localVerses && localVerses.length > 0) {
      console.log(`Loaded ${bookNameChi} ${chapter} from Local DB`);
      const cleanVerses = localVerses.map(v => ({ ...v, text: v.text.replace(/\s+/g, '') }));
      CACHE.set(cacheKey, cleanVerses);
      return cleanVerses;
    }
  } catch (e) {
    console.warn("Local DB lookup failed:", e);
  }

  // 2. Public API (Reliable External Source)
  try {
    const verses = await fetchFromPublicApi(bookNameEng, chapter);
    if (verses && verses.length > 0) {
      CACHE.set(cacheKey, verses);
      return verses;
    }
  } catch (apiError: any) {
    console.warn(`Public API failed for ${bookNameEng} ${chapter}: ${apiError.message}. Switching to AI.`);
  }

  // 3. AI Fallback (Flexible but slower)
  return withRetry(async () => {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `你是一個聖經資料庫。請完整列出《${bookNameChi}》(${bookNameEng}) 第 ${chapter} 章的中文和合本 (CUV) 經文。
        
        重要規則：
        1. 必須嚴格輸出 JSON 格式。
        2. 不要使用 Markdown 代碼塊。
        3. "verse" 欄位必須是簡單的「整數」(例如: 1, 2, 3)，絕不可使用小數點 (例如 1.0) 或科學記號。
        4. "text" 欄位為經文內容，不要包含節號。
        
        期望格式：
        {
          "verses": [
            {"verse": 1, "text": "經文內容..."},
            {"verse": 2, "text": "經文內容..."}
          ]
        }`,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.1,
          safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          ],
        }
      });

      const data = extractJSON(response.text || "{}", 'verses');
      const resultVerses = data.verses || data.data || (Array.isArray(data) ? data : []);

      if (Array.isArray(resultVerses) && resultVerses.length > 0) {
        const typedVerses = resultVerses.map((v: any) => ({
             verse: Math.floor(Number(v.verse)), // Force integer
             text: String(v.text).replace(/\s+/g, '') 
        })).filter((v: Verse) => !isNaN(v.verse) && v.text);

        if (typedVerses.length > 0) {
             CACHE.set(cacheKey, typedVerses);
             return typedVerses;
        }
      }
      
      throw new Error("AI returned empty verse list");
    } catch (error: any) {
      console.error("AI Generation Error:", error);
      // Let withRetry handle specific status codes
      throw error;
    }
  });
};

async function fetchFromPublicApi(book: string, chapter: number): Promise<Verse[]> {
  const url = `https://bible-api.com/${encodeURIComponent(book)}+${chapter}?translation=cuv`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(8000) 
  });
  
  if (!response.ok) {
    if (response.status === 404) throw new Error("Book/Chapter not found in Public API");
    throw new Error(`API Status: ${response.status}`);
  }

  const data = await response.json();
  if (!data.verses) throw new Error("No verses found in API response");

  return data.verses.map((v: any) => ({
    verse: v.verse,
    text: v.text.replace(/\s+/g, '')
  }));
}

export const searchBible = async (query: string): Promise<SearchResult[]> => {
  return withRetry(async () => {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Search CUV Bible for: "${query}". Return top 10 most relevant verses.
        Strict JSON format rules:
        1. "bookId": MUST be the standard 3-letter lowercase bible book code (e.g. "gen", "exo", "mat", "rev"). THIS IS CRITICAL.
        2. "bookName": Traditional Chinese Book Name.
        3. "chapter": Integer.
        4. "verse": Integer.
        5. "text": Content string.
        
        Example Output: 
        { "results": [{ "bookId": "gen", "bookName": "創世記", "chapter": 1, "verse": 1, "text": "起初..." }] }`,
        config: {
          responseMimeType: 'application/json',
          safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          ],
        }
      });

      const data = extractJSON(response.text || "{}", 'search');
      return data.results || [];
    } catch (error: any) {
      console.error("Search error:", error);
      throw error; // Rethrow to let withRetry handle status codes
    }
  });
};

/**
 * Diagnostic tool to check API key and connection status
 */
export const diagnoseConnection = async () => {
    const key = API_KEY;
    const isConfigured = key !== 'MISSING_KEY';
    // Show last 6 chars to differentiate old vs new keys
    const masked = isConfigured && key.length > 10 
        ? `${key.substring(0, 8)}...${key.substring(key.length - 6)}` 
        : (isConfigured ? 'Too Short' : 'N/A');

    const status = {
        keyConfigured: isConfigured,
        keyMasked: masked,
        connection: 'pending',
        error: null as string | null
    };

    try {
        if (!status.keyConfigured) throw new Error("API Key 未設定。請在本機建立 .env 檔案，或檢查 Vercel 環境變數 VITE_API_KEY。");
        
        await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: 'Hi',
        });
        status.connection = 'success';
    } catch (e: any) {
        status.connection = 'failed';
        const msg = e.message || '';
        // Pretty print error for UI
        if (msg.includes('expired')) {
             status.error = "Key 已過期 (Expired)。請產生新 Key 並在 Vercel 重新部署。";
        } else if (msg.includes('leaked')) {
             status.error = "Key 已被封鎖 (外洩)。請產生新 Key 並在 Vercel 重新部署。";
        } else if (e.status === 'PERMISSION_DENIED' || msg.includes('403')) {
             status.error = "權限被拒 (403)。金鑰可能被封鎖。";
        } else if (e.status === 'INVALID_ARGUMENT' || msg.includes('400')) {
             status.error = "Key 無效 (400)。Vercel 環境變數未更新？請 Redeploy。";
        } else if (e.status === 'RESOURCE_EXHAUSTED' || msg.includes('429')) {
             status.error = "配額已滿 (429)。";
        } else {
             status.error = msg || 'Unknown error';
        }
    }
    return status;
};
