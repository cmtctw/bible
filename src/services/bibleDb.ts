import { Verse } from '../types';
import { ALL_BOOKS } from '../constants';

const DB_NAME = 'GraceVerseDB';
const DB_VERSION = 1;
const STORE_NAME = 'chapters';

export const bibleDb = {
  db: null as IDBDatabase | null,
  isSupported: true,

  async init(): Promise<void> {
    if (this.db) return;
    // If we already determined it's not supported, stop trying.
    if (!this.isSupported) return;

    return new Promise((resolve) => {
      try {
          // Paranoid check: Even accessing window.indexedDB can throw in strict environments
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
            console.warn("IndexedDB open error (likely permission denied):", request.error);
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
          // This catches synchronous "Access to storage is not allowed" errors
          console.warn("IndexedDB initialization crashed (Security/Privacy settings):", e);
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

  async importData(jsonData: any): Promise<number> {
    await this.init();
    if (!this.db || !this.isSupported) throw new Error("您的瀏覽器不支援離線資料庫或權限被拒絕 (請嘗試關閉無痕模式)。");

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

        // 1. Detect JSON Structure
        if (Array.isArray(jsonData)) {
          booksToProcess = jsonData;
        } else if (typeof jsonData === 'object' && jsonData !== null) {
          if (Array.isArray(jsonData.books)) {
             booksToProcess = jsonData.books;
          } else if (Array.isArray(jsonData.data)) {
             booksToProcess = jsonData.data;
          } else if ((jsonData.name || jsonData.book) && Array.isArray(jsonData.chapters)) {
             booksToProcess = [jsonData];
          } else if (typeof jsonData.books === 'object') {
             booksToProcess = Object.values(jsonData.books);
          } else {
             const values = Object.values(jsonData);
             const likelyBooks = values.filter((v: any) => v && (v.chapters || v.book || v.name));
             if (likelyBooks.length > 0) {
                 booksToProcess = likelyBooks;
             }
          }
        }

        if (booksToProcess.length === 0) {
            transaction.abort();
            return reject(new Error("無法識別的 JSON 格式。請確認您下載的是正確的聖經檔案。"));
        }

        for (const book of booksToProcess) {
          let rawName = book.name || book.book || book.abbrev;
          if (!rawName) continue;

          let targetBookName = rawName;
          
          const matchedBook = ALL_BOOKS.find(b => 
            b.name === rawName || 
            b.englishName === rawName || 
            b.englishName.toLowerCase() === rawName.toLowerCase() ||
            b.id === rawName
          );

          if (matchedBook) {
            targetBookName = matchedBook.name;
          } else {
             if (/^[A-Za-z0-9\s]+$/.test(rawName)) {
                continue; 
             }
          }

          if (!book.chapters) continue;

          let chaptersArray: any[] = [];
          if (Array.isArray(book.chapters)) {
              chaptersArray = book.chapters;
          } else if (typeof book.chapters === 'object') {
              chaptersArray = Object.keys(book.chapters)
                  .sort((a, b) => parseInt(a) - parseInt(b))
                  .map(k => book.chapters[k]);
          }

          chaptersArray.forEach((chapterContent: any, chapterIdx: number) => {
            let chapterNum = chapterIdx + 1;
            let verseObjects: Verse[] = [];

            if (Array.isArray(chapterContent)) {
               if (chapterContent.length > 0 && typeof chapterContent[0] === 'string') {
                    verseObjects = chapterContent.map((text: any, vIdx: number) => ({
                        verse: vIdx + 1,
                        text: String(text).replace(/\s+/g, '')
                    }));
               }
            } 
            else if (typeof chapterContent === 'object' && chapterContent !== null) {
                if (chapterContent.chapter) {
                    const parsedNum = parseInt(chapterContent.chapter, 10);
                    if (!isNaN(parsedNum)) chapterNum = parsedNum;
                }
                
                let versesList: any[] = [];
                if (Array.isArray(chapterContent.verses)) {
                    versesList = chapterContent.verses;
                } else if (typeof chapterContent === 'object' && !chapterContent.verses) {
                     const keys = Object.keys(chapterContent).filter(k => k !== 'chapter' && !isNaN(parseInt(k)));
                     if (keys.length > 0) {
                         versesList = keys.sort((a,b) => parseInt(a)-parseInt(b)).map(k => ({
                             verse: k,
                             text: chapterContent[k]
                         }));
                     }
                }

                if (versesList.length > 0) {
                    verseObjects = versesList.map((v: any) => ({
                        verse: parseInt(v.verse, 10),
                        text: v.text ? String(v.text).replace(/\s+/g, '') : '' 
                    }));
                }
            }

            if (verseObjects.length > 0) {
                const key = `${targetBookName}-${chapterNum}`;
                store.put(verseObjects, key);
                count++;
            }
          });
        }
        
        if (count === 0) {
            transaction.abort();
            return reject(new Error("沒有成功匯入任何章節，請檢查 JSON 檔案內容。"));
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
    
    return new Promise((resolve, reject) => {
       try {
           const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
           const store = transaction.objectStore(STORE_NAME);
           const req = store.clear();
           req.onsuccess = () => resolve();
           req.onerror = () => reject(req.error);
       } catch (e) {
           reject(e);
       }
    });
  }
};