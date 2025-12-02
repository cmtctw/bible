export interface Book {
  id: string;
  name: string;
  englishName: string;
  category: 'Old Testament' | 'New Testament';
  chapterCount: number;
}

export interface Verse {
  verse: number;
  text: string;
}

export interface ChapterData {
  bookId: string;
  chapter: number;
  verses: Verse[];
}

export interface SearchResult {
  book: string;
  chapter: number;
  verse: number;
  text: string;
}

// Gemini Live API Types
export type LiveStatus = 'disconnected' | 'connecting' | 'connected' | 'error';