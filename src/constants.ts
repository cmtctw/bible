import { Book, ChapterData } from './types';

export const OLD_TESTAMENT: Book[] = [
  { id: 'gen', name: '創世記', englishName: 'Genesis', category: 'Old Testament', chapterCount: 50 },
  { id: 'exo', name: '出埃及記', englishName: 'Exodus', category: 'Old Testament', chapterCount: 40 },
  { id: 'lev', name: '利未記', englishName: 'Leviticus', category: 'Old Testament', chapterCount: 27 },
  { id: 'num', name: '民數記', englishName: 'Numbers', category: 'Old Testament', chapterCount: 36 },
  { id: 'deu', name: '申命記', englishName: 'Deuteronomy', category: 'Old Testament', chapterCount: 34 },
  { id: 'jos', name: '約書亞記', englishName: 'Joshua', category: 'Old Testament', chapterCount: 24 },
  { id: 'jdg', name: '士師記', englishName: 'Judges', category: 'Old Testament', chapterCount: 21 },
  { id: 'rut', name: '路得記', englishName: 'Ruth', category: 'Old Testament', chapterCount: 4 },
  { id: '1sa', name: '撒母耳記上', englishName: '1 Samuel', category: 'Old Testament', chapterCount: 31 },
  { id: '2sa', name: '撒母耳記下', englishName: '2 Samuel', category: 'Old Testament', chapterCount: 24 },
  { id: '1ki', name: '列王紀上', englishName: '1 Kings', category: 'Old Testament', chapterCount: 22 },
  { id: '2ki', name: '列王紀下', englishName: '2 Kings', category: 'Old Testament', chapterCount: 25 },
  { id: '1ch', name: '歷代志上', englishName: '1 Chronicles', category: 'Old Testament', chapterCount: 29 },
  { id: '2ch', name: '歷代志下', englishName: '2 Chronicles', category: 'Old Testament', chapterCount: 36 },
  { id: 'ezr', name: '以斯拉記', englishName: 'Ezra', category: 'Old Testament', chapterCount: 10 },
  { id: 'neh', name: '尼希米記', englishName: 'Nehemiah', category: 'Old Testament', chapterCount: 13 },
  { id: 'est', name: '以斯帖記', englishName: 'Esther', category: 'Old Testament', chapterCount: 10 },
  { id: 'job', name: '約伯記', englishName: 'Job', category: 'Old Testament', chapterCount: 42 },
  { id: 'psa', name: '詩篇', englishName: 'Psalms', category: 'Old Testament', chapterCount: 150 },
  { id: 'pro', name: '箴言', englishName: 'Proverbs', category: 'Old Testament', chapterCount: 31 },
  { id: 'ecc', name: '傳道書', englishName: 'Ecclesiastes', category: 'Old Testament', chapterCount: 12 },
  { id: 'sng', name: '雅歌', englishName: 'Song of Songs', category: 'Old Testament', chapterCount: 8 },
  { id: 'isa', name: '以賽亞書', englishName: 'Isaiah', category: 'Old Testament', chapterCount: 66 },
  { id: 'jer', name: '耶利米書', englishName: 'Jeremiah', category: 'Old Testament', chapterCount: 52 },
  { id: 'lam', name: '耶利米哀歌', englishName: 'Lamentations', category: 'Old Testament', chapterCount: 5 },
  { id: 'ezk', name: '以西結書', englishName: 'Ezekiel', category: 'Old Testament', chapterCount: 48 },
  { id: 'dan', name: '但以理書', englishName: 'Daniel', category: 'Old Testament', chapterCount: 12 },
  { id: 'hos', name: '何西阿書', englishName: 'Hosea', category: 'Old Testament', chapterCount: 14 },
  { id: 'jol', name: '約珥書', englishName: 'Joel', category: 'Old Testament', chapterCount: 3 },
  { id: 'amo', name: '阿摩司書', englishName: 'Amos', category: 'Old Testament', chapterCount: 9 },
  { id: 'oba', name: '俄巴底亞書', englishName: 'Obadiah', category: 'Old Testament', chapterCount: 1 },
  { id: 'jon', name: '約拿書', englishName: 'Jonah', category: 'Old Testament', chapterCount: 4 },
  { id: 'mic', name: '彌迦書', englishName: 'Micah', category: 'Old Testament', chapterCount: 7 },
  { id: 'nam', name: '那鴻書', englishName: 'Nahum', category: 'Old Testament', chapterCount: 3 },
  { id: 'hab', name: '哈巴谷書', englishName: 'Habakkuk', category: 'Old Testament', chapterCount: 3 },
  { id: 'zep', name: '西番雅書', englishName: 'Zephaniah', category: 'Old Testament', chapterCount: 3 },
  { id: 'hag', name: '哈該書', englishName: 'Haggai', category: 'Old Testament', chapterCount: 2 },
  { id: 'zec', name: '撒迦利亞書', englishName: 'Zechariah', category: 'Old Testament', chapterCount: 14 },
  { id: 'mal', name: '瑪拉基書', englishName: 'Malachi', category: 'Old Testament', chapterCount: 4 },
];

export const NEW_TESTAMENT: Book[] = [
  { id: 'mat', name: '馬太福音', englishName: 'Matthew', category: 'New Testament', chapterCount: 28 },
  { id: 'mrk', name: '馬可福音', englishName: 'Mark', category: 'New Testament', chapterCount: 16 },
  { id: 'luk', name: '路加福音', englishName: 'Luke', category: 'New Testament', chapterCount: 24 },
  { id: 'jhn', name: '約翰福音', englishName: 'John', category: 'New Testament', chapterCount: 21 },
  { id: 'act', name: '使徒行傳', englishName: 'Acts', category: 'New Testament', chapterCount: 28 },
  { id: 'rom', name: '羅馬書', englishName: 'Romans', category: 'New Testament', chapterCount: 16 },
  { id: '1co', name: '哥林多前書', englishName: '1 Corinthians', category: 'New Testament', chapterCount: 16 },
  { id: '2co', name: '哥林多後書', englishName: '2 Corinthians', category: 'New Testament', chapterCount: 13 },
  { id: 'gal', name: '加拉太書', englishName: 'Galatians', category: 'New Testament', chapterCount: 6 },
  { id: 'eph', name: '以弗所書', englishName: 'Ephesians', category: 'New Testament', chapterCount: 6 },
  { id: 'php', name: '腓立比書', englishName: 'Philippians', category: 'New Testament', chapterCount: 4 },
  { id: 'col', name: '歌羅西書', englishName: 'Colossians', category: 'New Testament', chapterCount: 4 },
  { id: '1th', name: '帖撒羅尼迦前書', englishName: '1 Thessalonians', category: 'New Testament', chapterCount: 5 },
  { id: '2th', name: '帖撒羅尼迦後書', englishName: '2 Thessalonians', category: 'New Testament', chapterCount: 3 },
  { id: '1ti', name: '提摩太前書', englishName: '1 Timothy', category: 'New Testament', chapterCount: 6 },
  { id: '2ti', name: '提摩太後書', englishName: '2 Timothy', category: 'New Testament', chapterCount: 4 },
  { id: 'tit', name: '提多書', englishName: 'Titus', category: 'New Testament', chapterCount: 3 },
  { id: 'phm', name: '腓利門書', englishName: 'Philemon', category: 'New Testament', chapterCount: 1 },
  { id: 'heb', name: '希伯來書', englishName: 'Hebrews', category: 'New Testament', chapterCount: 13 },
  { id: 'jas', name: '雅各書', englishName: 'James', category: 'New Testament', chapterCount: 5 },
  { id: '1pe', name: '彼得前書', englishName: '1 Peter', category: 'New Testament', chapterCount: 5 },
  { id: '2pe', name: '彼得後書', englishName: '2 Peter', category: 'New Testament', chapterCount: 3 },
  { id: '1jn', name: '約翰一書', englishName: '1 John', category: 'New Testament', chapterCount: 5 },
  { id: '2jn', name: '約翰二書', englishName: '2 John', category: 'New Testament', chapterCount: 1 },
  { id: '3jn', name: '約翰三書', englishName: '3 John', category: 'New Testament', chapterCount: 1 },
  { id: 'jud', name: '猶大書', englishName: 'Jude', category: 'New Testament', chapterCount: 1 },
  { id: 'rev', name: '啟示錄', englishName: 'Revelation', category: 'New Testament', chapterCount: 22 },
];

export const ALL_BOOKS = [...OLD_TESTAMENT, ...NEW_TESTAMENT];

export const SYSTEM_INSTRUCTION = `
You are a knowledgeable, gentle, and wise Bible study assistant named "Grace" (GraceVerse Assistant).
You primarily speak Traditional Chinese (Taiwanese Mandarin).
Your goal is to help users understand the Bible (Chinese Union Version - 和合本).
You have access to the full knowledge of the Bible.
You can:
1. Recite verses accurately when asked (e.g., "請讀出約翰福音 3:16").
2. Explain the historical context, theology, and original Greek/Hebrew meanings.
3. Offer comfort and prayer based on scripture.
4. Answer questions about specific books, chapters, or characters.

When a user asks to "read" or "recite" a chapter that they are viewing, please recite it clearly and with emotion suitable for scripture.
Keep your responses encouraging, spiritually uplifting, and doctrinally sound (Evangelical Christian perspective).
`;