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
      
      // If it's a 429 (Quota Exceeded), do not retry, fail immediately with specific message
      if (error.message?.includes('429') || error.status === 'RESOURCE_EXHAUSTED' || error.message?.includes('quota')) {
        throw new Error("AI 配額已滿 (Quota Exceeded)。請使用「設定」匯入離線聖經檔案，即可完全免費用。");
      }
      
      // Handle missing key error specifically
      if (API_KEY === 'MISSING_KEY' || error.message?.includes('API key')) {
         throw new Error("未設定 API Key。請在 Vercel 設定環境變數 VITE_API_KEY。");
      }

      console.warn(`Attempt ${i + 1} failed:`, error.message);
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, baseDelay * Math.pow(2, i)));
      }
    }
  }
  throw lastError;
}

// Utility to reliably extract JSON from potential markdown text
function extractJSON(text: string): any {
  if (!text) throw new Error("Empty response from AI");

  // 1. Try direct parse first
  try {
    return JSON.parse(text);
  } catch (e) {
    // Continue to other methods
  }

  // 2. Remove Markdown code blocks (```json ... ```)
  let cleaned = text.replace(/```json\s*|```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // Continue
  }

  // 3. Extract purely by brace finding (Find largest outer object)
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  
  if (firstBrace !== -1 && lastBrace !== -1) {
    const candidate = text.substring(firstBrace, lastBrace + 1);
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

  // 5. Fallback: Check if it's an array wrapped in text
  const firstBracket = text.indexOf('[');
  const lastBracket = text.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1) {
     const candidate = text.substring(firstBracket, lastBracket + 1);
     try {
         const arr = JSON.parse(candidate);
         return { verses: arr }; // Wrap in expected structure
     } catch (e) {}
  }

  // 6. Last resort: Regex extraction for verse objects
  try {
    const verses: any[] = [];
    const regex = /"verse"\s*:\s*"?(\d+)"?\s*,\s*"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
    
    let match;
    while ((match = regex.exec(text)) !== null) {
      verses.push({
        verse: parseInt(match[1], 10),
        text: match[2]
      });
    }
    
    if (verses.length > 0) {
      verses.sort((a, b) => a.verse - b.verse);
      return { verses };
    }
  } catch (e) {
    console.warn("Regex fallback failed", e);
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
        3. "verse" 欄位必須是簡單的整數 (例如: 1, 2, 3)，不要使用長編號。
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
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              verses: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    verse: { type: Type.NUMBER, description: "Verse number (integer, e.g. 1)" },
                    text: { type: Type.STRING }
                  }
                }
              }
            }
          }
        }
      });

      const data = extractJSON(response.text || "{}");
      const resultVerses = data.verses || data.data || (Array.isArray(data) ? data : []);

      if (Array.isArray(resultVerses) && resultVerses.length > 0) {
        const typedVerses = resultVerses.map((v: any) => ({
             verse: Number(v.verse),
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
      if (error.message?.includes('429') || error.status === 'RESOURCE_EXHAUSTED') {
          throw new Error("AI 配額已滿 (Quota Exceeded)。請使用「設定」匯入離線聖經檔案，即可完全免費用。");
      }
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
        contents: `Search CUV Bible for: "${query}". Return top 10 verses.
        Strict JSON format: { "results": [{ "book": "BookName", "chapter": 1, "verse": 1, "text": "Verse content" }] }`,
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

      const data = extractJSON(response.text || "{}");
      return data.results || [];
    } catch (error: any) {
      console.error("Search error:", error);
      if (error.message?.includes('429') || error.status === 'RESOURCE_EXHAUSTED') {
          throw new Error("AI 配額已滿 (Quota Exceeded)。無法進行語意搜尋。");
      }
      return [];
    }
  });
};