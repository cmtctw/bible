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
      
      if (errorMessage.includes('expired')) throw new Error("API Key 已過期 (Expired)。請前往 Google AI Studio 申請新金鑰，並在 Vercel 重新部署。");
      if (errorMessage.includes('leaked') || errorMessage.includes('403')) throw new Error("API Key 已被封鎖。請更換金鑰。");
      if (errorMessage.includes('429')) throw new Error("AI 配額已滿。請使用離線資料庫。");
      if (API_KEY === 'MISSING_KEY' || errorMessage.includes('400')) throw new Error("API Key 無效。請檢查 Vercel 環境變數 VITE_API_KEY。");

      console.warn(`Attempt ${i + 1} failed:`, errorMessage);
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, baseDelay * Math.pow(2, i)));
      }
    }
  }
  throw lastError;
}

// Utility to reliably extract JSON
function extractJSON(text: string, mode: 'verses' | 'search' = 'verses'): any {
  if (!text) throw new Error("Empty response from AI");

  let sanitizedText = text.replace(/"verse"\s*:\s*(\d+)\.0+/g, '"verse": $1');
  sanitizedText = sanitizedText.replace(/"chapter"\s*:\s*(\d+)\.0+/g, '"chapter": $1');
  sanitizedText = sanitizedText.replace(/:\s*(\d{15,})/g, ': $1'); 

  try { return JSON.parse(sanitizedText); } catch (e) {}

  let cleaned = sanitizedText.replace(/```json\s*|```/g, '').trim();
  try { return JSON.parse(cleaned); } catch (e) {}

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    try { return JSON.parse(cleaned.substring(firstBrace, lastBrace + 1)); } catch (e) {}
  }

  // Array fallback
  const firstBracket = cleaned.indexOf('[');
  const lastBracket = cleaned.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1) {
     try {
         const arr = JSON.parse(cleaned.substring(firstBracket, lastBracket + 1));
         return mode === 'verses' ? { verses: arr } : { results: arr }; 
     } catch (e) {}
  }

  throw new Error("AI 資料格式錯誤，請重試或使用離線模式。");
}

export const getChapterContent = async (bookNameEng: string, bookNameChi: string, chapter: number): Promise<Verse[]> => {
  const cacheKey = `${bookNameEng}-${chapter}`;
  if (CACHE.has(cacheKey)) return CACHE.get(cacheKey)!;

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

  try {
    const verses = await fetchFromPublicApi(bookNameEng, chapter);
    if (verses && verses.length > 0) {
      CACHE.set(cacheKey, verses);
      return verses;
    }
  } catch (apiError) {}

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `List ${bookNameChi} (${bookNameEng}) Chapter ${chapter} verses (CUV). JSON only. {"verses": [{"verse": 1, "text": "..."}]}. Integers for verse numbers. No spaces in text.`,
      config: { responseMimeType: 'application/json' }
    });

    const data = extractJSON(response.text || "{}", 'verses');
    const resultVerses = data.verses || data.data || (Array.isArray(data) ? data : []);
    
    if (Array.isArray(resultVerses) && resultVerses.length > 0) {
      const typedVerses = resultVerses.map((v: any) => ({
           verse: Math.floor(Number(v.verse)), 
           text: String(v.text).replace(/\s+/g, '') 
      })).filter((v: Verse) => !isNaN(v.verse) && v.text);
      
      CACHE.set(cacheKey, typedVerses);
      return typedVerses;
    }
    throw new Error("AI returned empty verse list");
  });
};

async function fetchFromPublicApi(book: string, chapter: number): Promise<Verse[]> {
  const url = `https://bible-api.com/${encodeURIComponent(book)}+${chapter}?translation=cuv`;
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error("API Error");
  const data = await response.json();
  return data.verses.map((v: any) => ({ verse: v.verse, text: v.text.replace(/\s+/g, '') }));
}

export const searchBible = async (query: string): Promise<SearchResult[]> => {
  // 1. Priority: Local DB Full Text Search (Unlimited results)
  try {
      const localResults = await bibleDb.search(query);
      if (localResults.length > 0) {
          console.log(`Found ${localResults.length} results in Local DB`);
          return localResults;
      }
  } catch (e) {
      console.warn("Local search failed, falling back to AI", e);
  }

  // 2. Fallback: AI Search (Limited results, but semantic)
  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Search CUV Bible for "${query}". Top 20 results.
      JSON: { "results": [{ "bookId": "gen", "bookName": "創世記", "chapter": 1, "verse": 1, "text": "complete text" }] }.
      Rules: bookId must be standard 3-letter code. Text must be verbatim.`,
      config: { responseMimeType: 'application/json' }
    });

    const data = extractJSON(response.text || "{}", 'search');
    return data.results || [];
  });
};

export const diagnoseConnection = async () => {
    const key = API_KEY;
    const isConfigured = key !== 'MISSING_KEY';
    const masked = isConfigured && key.length > 10 
        ? `${key.substring(0, 8)}...${key.substring(key.length - 6)}` 
        : (isConfigured ? 'Too Short' : 'N/A');

    const status = { keyConfigured: isConfigured, keyMasked: masked, connection: 'pending', error: null as string | null };

    try {
        if (!status.keyConfigured) throw new Error("API Key 未設定。");
        await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: 'Hi' });
        status.connection = 'success';
    } catch (e: any) {
        status.connection = 'failed';
        status.error = e.message || 'Unknown Error';
    }
    return status;
};