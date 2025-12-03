import { Verse, SearchResult } from '../types';
import { ALL_BOOKS } from '../constants';

const DB_NAME = 'GraceVerseDB';
const DB_VERSION = 1;
const STORE_NAME = 'chapters';

export const bibleDb = {
  db: null as IDBDatabase | null,
  isSupported: true,

  async init(): Promise<void> {
    if (this.db) return;
    if (!this.isSupported) return;

    return new Promise((resolve) => {
      try {
          let idb: IDBFactory | undefined;
          try {
              if (typeof window === 'undefined') {
                  this.isSupported = false;
                  return resolve();
              }
              idb = window.indexedDB;
          } catch (e) {
              console.warn("Access to window.indexedDB blocked:", e);
              this.isSupported = false;
              return resolve();
          }

          if (!idb) {
              this.isSupported = false;
              console.warn("IndexedDB not supported by browser.");
              return resolve();
          }

          const request = idb.open(DB_NAME, DB_VERSION);

          request.onerror = (event) => {
            console.warn("IndexedDB open error:", request.error);
            this.isSupported = false;
            resolve();
          };

          request.onupgradeneeded = (event) => {
            try {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                  db.createObjectStore(STORE_NAME);
                }
            } catch (e) {
                console.error("Error creating object store", e);
            }
          };

          request.onsuccess = (event) => {
            this.db = (event.target as IDBOpenDBRequest).result;
            resolve();
          };
      } catch (e) {
          console.warn("IndexedDB initialization crashed:", e);
          this.isSupported = false;
          resolve();
      }
    });
  },

  async getChapter(bookNameChi: string, chapter: number): Promise<Verse[] | null> {
    try {
        await this.init();
        if (!this.db || !this.isSupported) return null;

        return new Promise((resolve) => {
          try {
              const transaction = this.db!.transaction([STORE_NAME], 'readonly');
              const store = transaction.objectStore(STORE_NAME);
              const key = `${bookNameChi}-${chapter}`;
              
              const request = store.get(key);
              
              request.onsuccess = () => {
                resolve(request.result as Verse[] || null);
              };
              
              request.onerror = () => {
                resolve(null);
              };
          } catch (e) {
              console.warn("DB Transaction failed:", e);
              resolve(null);
          }
        });
    } catch (e) {
        return null;
    }
  },

  async getChapterCount(): Promise<number> {
    try {
        await this.init();
        if (!this.db || !this.isSupported) return 0;
        
        return new Promise((resolve) => {
            try {
                const transaction = this.db!.transaction([STORE_NAME], 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const req = store.count();
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => resolve(0);
            } catch (e) {
                resolve(0);
            }
        });
    } catch (e) {
        return 0;
    }
  },

  // NEW: Full Text Search implementation
  async search(query: string): Promise<SearchResult[]> {
    try {
        await this.init();
        if (!this.db || !this.isSupported) return [];

        return new Promise((resolve) => {
            const results: SearchResult[] = [];
            try {
                const transaction = this.db!.transaction([STORE_NAME], 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.openCursor();

                request.onsuccess = (event) => {
                    const cursor = (event.target as IDBRequest).result;
                    if (cursor) {
                        // Key format: "BookName-Chapter"
                        // Value format: Verse[]
                        const verses = cursor.value as Verse[];
                        const key = cursor.key as string;
                        
                        // Simple parse of the key to get book and chapter
                        const dashIndex = key.lastIndexOf('-');
                        const bookName = key.substring(0, dashIndex);
                        const chapterStr = key.substring(dashIndex + 1);
                        const chapter = parseInt(chapterStr, 10);

                        // Search within verses
                        for (const v of verses) {
                            if (v.text.includes(query)) {
                                results.push({
                                    book: bookName,
                                    chapter: chapter,
                                    verse: v.verse,
                                    text: v.text
                                });
                            }
                        }
                        cursor.continue();
                    } else {
                        // Iteration complete
                        resolve(results);
                    }
                };

                request.onerror = () => resolve([]);
            } catch (e) {
                console.error("Search transaction failed", e);
                resolve([]);
            }
        });
    } catch (e) {
        console.error("Search failed", e);
        return [];
    }
  },

  async importData(jsonData: any): Promise<number> {
    await this.init();
    if (!this.db || !this.isSupported) throw new Error("您的瀏覽器不支援離線資料庫或權限被拒絕。");

    return new Promise((resolve, reject) => {
      let transaction: IDBTransaction;
      try {
          transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      } catch (e) {
          return reject(new Error("無法寫入資料庫，權限不足或資料庫未開啟。"));
      }

      const store = transaction.objectStore(STORE_NAME);
      let count = 0;

      transaction.oncomplete = () => {
        resolve(count);
      };

      transaction.onerror = () => {
        reject(transaction.error);
      };

      try {
        let booksToProcess: any[] = [];

        if (Array.isArray(jsonData)) {
          booksToProcess = jsonData;
        } else if (typeof jsonData === 'object' && jsonData !== null) {
             // Handle various JSON structures (same as before)
             if (Array.isArray(jsonData.books)) booksToProcess = jsonData.books;
             else if (Array.isArray(jsonData.data)) booksToProcess = jsonData.data;
             else if (jsonData.name && Array.isArray(jsonData.chapters)) booksToProcess = [jsonData];
             else if (typeof jsonData.books === 'object') booksToProcess = Object.values(jsonData.books);
        }

        if (booksToProcess.length === 0) {
            transaction.abort();
            return reject(new Error("無法識別的 JSON 格式。"));
        }

        for (const book of booksToProcess) {
          let rawName = book.name || book.book || book.abbrev;
          if (!rawName) continue;

          let targetBookName = rawName;
          
          const matchedBook = ALL_BOOKS.find(b => 
            b.name === rawName || 
            b.englishName === rawName || 
            b.id === rawName
          );

          if (matchedBook) targetBookName = matchedBook.name;

          let chaptersArray: any[] = [];
          if (Array.isArray(book.chapters)) {
              chaptersArray = book.chapters;
          } else if (typeof book.chapters === 'object') {
              chaptersArray = Object.keys(book.chapters).sort((a,b)=>Number(a)-Number(b)).map(k=>book.chapters[k]);
          }

          chaptersArray.forEach((chapterContent: any, chapterIdx: number) => {
            let chapterNum = chapterIdx + 1;
            let verseObjects: Verse[] = [];

            // Standardize verse extraction
            if (Array.isArray(chapterContent)) { // ["text", "text"]
               verseObjects = chapterContent.map((t:any, i:number) => ({ verse: i+1, text: String(t).replace(/\s+/g,'') }));
            } else if (typeof chapterContent === 'object') { // { "1": "text", "2": "text" } or { verses: [] }
                if (chapterContent.chapter) chapterNum = Number(chapterContent.chapter);
                
                if (Array.isArray(chapterContent.verses)) {
                     verseObjects = chapterContent.verses.map((v:any) => ({ verse: Number(v.verse), text: String(v.text).replace(/\s+/g,'') }));
                } else {
                     Object.keys(chapterContent).forEach(k => {
                         if (!isNaN(Number(k))) verseObjects.push({ verse: Number(k), text: String(chapterContent[k]).replace(/\s+/g,'') });
                     });
                     verseObjects.sort((a,b)=>a.verse-b.verse);
                }
            }

            if (verseObjects.length > 0) {
                store.put(verseObjects, `${targetBookName}-${chapterNum}`);
                count++;
            }
          });
        }
        
        if (count === 0) {
            transaction.abort();
            return reject(new Error("沒有成功匯入任何章節。"));
        }

      } catch (e) {
        transaction.abort();
        reject(e);
      }
    });
  },

  async clear(): Promise<void> {
    await this.init();
    if (!this.db || !this.isSupported) return;
    const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
    transaction.objectStore(STORE_NAME).clear();
  }
};