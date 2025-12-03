import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Book as BookIcon, Search, ChevronRight, Menu, X, BookOpen, Loader2, AlertCircle, ChevronLeft, Settings, Upload, Database, CheckCircle, Download, ExternalLink, Save, Github, FileJson, ChevronDown, Grid, Activity, Clock } from 'lucide-react';
import { ALL_BOOKS, OLD_TESTAMENT, NEW_TESTAMENT } from './constants';
import { Book, ChapterData, Verse, SearchResult } from './types';
import VoiceAssistant from './components/VoiceAssistant';
import { getChapterContent, searchBible, diagnoseConnection } from './services/bibleService';
import { bibleDb } from './services/bibleDb';

// -- Sub Components --

const Header = ({ 
  onSearchInput, 
  onMenuToggle, 
  isMenuOpen,
  onSearchSubmit,
  searchQuery,
  onOpenSettings
}: { 
  onSearchInput: (val: string) => void, 
  onMenuToggle: () => void, 
  isMenuOpen: boolean,
  onSearchSubmit: () => void,
  searchQuery: string,
  onOpenSettings: () => void
}) => (
  <header className="fixed top-0 left-1/2 -translate-x-1/2 w-[80%] h-16 bg-bible-paper border-b border-x border-bible-accent flex items-center justify-between px-4 z-40 shadow-sm font-sans rounded-b-lg">
    <div className="flex items-center gap-3">
      <button onClick={onMenuToggle} className="lg:hidden p-2 text-bible-text hover:bg-bible-accent/20 rounded-full">
        {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
      </button>
      <div className="flex items-center gap-2 text-bible-red">
        <BookOpen className="w-8 h-8" />
        <h1 className="font-bold text-3xl tracking-wide hidden md:block">CMTC 線上聖經閱讀與查詢</h1>
      </div>
    </div>

    <div className="flex-1 max-w-xl mx-4">
      <div className="relative group">
        <input 
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSearchSubmit();
          }}
          placeholder="搜尋經文 (例如：愛、摩西)..."
          className="w-full pl-10 pr-4 py-2 bg-white border border-bible-accent rounded-full text-sm focus:outline-none focus:border-bible-gold focus:ring-1 focus:ring-bible-gold transition-all"
        />
        <Search className="absolute left-3 top-2.5 text-gray-400 w-4 h-4 group-focus-within:text-bible-gold transition-colors" />
      </div>
    </div>

    <button 
        onClick={onOpenSettings}
        className="p-2 text-gray-500 hover:text-bible-text hover:bg-bible-accent/20 rounded-full transition-colors"
        title="設定"
    >
        <Settings size={24} />
    </button>
  </header>
);

const BookList = ({ 
  currentBookId, 
  onSelectBook 
}: { 
  currentBookId: string, 
  onSelectBook: (id: string) => void 
}) => {
  const [tab, setTab] = useState<'old' | 'new'>('old');
  const books = tab === 'old' ? OLD_TESTAMENT : NEW_TESTAMENT;

  return (
    <div className="flex flex-col h-full bg-bible-paper border-r border-bible-accent font-sans">
      <div className="flex border-b border-bible-accent">
        <button 
          onClick={() => setTab('old')}
          className={`flex-1 py-4 text-2xl font-bold transition-colors ${tab === 'old' ? 'text-bible-red bg-bible-accent/30' : 'text-gray-400 hover:text-bible-red'}`}
        >
          舊約
        </button>
        <button 
          onClick={() => setTab('new')}
          className={`flex-1 py-4 text-2xl font-bold transition-colors ${tab === 'new' ? 'text-bible-red bg-bible-accent/30' : 'text-gray-400 hover:text-bible-red'}`}
        >
          新約
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {books.map(book => (
          <button
            key={book.id}
            onClick={() => onSelectBook(book.id)}
            className={`w-full text-left px-5 py-4 rounded-lg flex items-center justify-between group transition-all ${
              currentBookId === book.id 
                ? 'bg-bible-gold text-white shadow-md' 
                : 'hover:bg-white text-bible-text'
            }`}
          >
            <span className={`text-xl ${currentBookId === book.id ? 'font-bold' : 'font-medium'}`}>{book.name}</span>
            {currentBookId === book.id && <ChevronRight size={20} />}
          </button>
        ))}
      </div>
    </div>
  );
};

const ChapterView = ({ 
  book, 
  chapter, 
  onChangeChapter,
  onOpenSettings
}: { 
  book: Book, 
  chapter: number, 
  onChangeChapter: (c: number) => void,
  onOpenSettings: () => void
}) => {
  const [verses, setVerses] = useState<Verse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(false);
  const [displayData, setDisplayData] = useState<{verses: Verse[], bookName: string, chapter: number} | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (gridRef.current && !gridRef.current.contains(event.target as Node)) {
        setShowGrid(false);
      }
    };
    if (showGrid) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showGrid]);

  useEffect(() => {
    const fetchContent = async () => {
      setLoading(true);
      setError(null);
      setShowGrid(false);
      try {
        const data = await getChapterContent(book.englishName, book.name, chapter);
        setVerses(data);
        setDisplayData({ verses: data, bookName: book.name, chapter: chapter });
      } catch (err: any) {
        console.error("Failed to load bible:", err);
        setError(err.message || '無法載入經文。');
      } finally {
        setLoading(false);
      }
    };
    fetchContent();
  }, [book.id, book.name, book.englishName, chapter]);

  const allChapters = Array.from({ length: book.chapterCount }, (_, i) => i + 1);
  const visibleVerses = !loading ? verses : (displayData?.verses || []);
  const isTransitioning = loading && displayData !== null;
  const isQuotaError = error && (error.includes('Quota') || error.includes('配額'));

  return (
    <div className="w-full max-w-5xl mx-auto px-6 py-8 animate-fade-in font-sans">
      <div className="flex flex-col md:flex-row items-center justify-between mb-8 border-b border-bible-accent pb-4 gap-4 sticky top-0 bg-[#fdfbf7]/95 backdrop-blur-sm z-10 p-2">
        <h2 className="text-3xl font-bold text-bible-text">{book.name}</h2>
        <div className="relative" ref={gridRef}>
            <div className="flex items-center gap-2 bg-white rounded-lg px-2 py-1 shadow-sm border border-bible-accent">
                <button disabled={chapter <= 1} onClick={() => onChangeChapter(chapter - 1)} className="p-2 hover:bg-bible-accent/30 rounded text-bible-text disabled:opacity-30"><ChevronLeft size={20} /></button>
                <button onClick={() => setShowGrid(!showGrid)} className="flex items-center gap-2 px-4 py-2 hover:bg-bible-accent/30 rounded min-w-[140px] justify-center"><span className="font-bold text-lg">第 {chapter} 章</span><ChevronDown size={16} /></button>
                <button disabled={chapter >= book.chapterCount} onClick={() => onChangeChapter(chapter + 1)} className="p-2 hover:bg-bible-accent/30 rounded text-bible-text disabled:opacity-30"><ChevronRight size={20} /></button>
            </div>
            {showGrid && (
                <div className="absolute top-full right-0 mt-2 w-[300px] md:w-[400px] max-h-[60vh] overflow-y-auto bg-white shadow-2xl rounded-xl border border-bible-gold/30 p-4 z-50 animate-fade-in-up">
                    <div className="grid grid-cols-5 gap-2">
                        {allChapters.map((c) => (
                            <button key={c} onClick={() => { onChangeChapter(c); setShowGrid(false); }} className={`py-2 rounded-lg text-sm font-bold border ${c === chapter ? 'bg-bible-gold text-white' : 'bg-gray-50'}`}>{c}</button>
                        ))}
                    </div>
                </div>
            )}
        </div>
      </div>
      
      {!loading && !error && (
        <div className="flex justify-between items-center mb-6 mt-2 px-1">
            <button disabled={chapter <= 1} onClick={() => onChangeChapter(chapter - 1)} className={`flex items-center gap-1 px-4 py-2 rounded-lg font-bold ${chapter <= 1 ? 'text-gray-300' : 'text-bible-gold hover:bg-white'}`}><ChevronLeft size={20} />上一章</button>
            <button disabled={chapter >= book.chapterCount} onClick={() => onChangeChapter(chapter + 1)} className={`flex items-center gap-1 px-4 py-2 rounded-lg font-bold ${chapter >= book.chapterCount ? 'text-gray-300' : 'text-bible-gold hover:bg-white'}`}>下一章<ChevronRight size={20} /></button>
        </div>
      )}

      {loading && !displayData ? (
        <div className="flex flex-col items-center justify-center py-20 text-bible-gold"><Loader2 className="w-10 h-10 animate-spin mb-4" /><p>正在載入經文...</p></div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20 text-bible-red text-center"><AlertCircle className="w-12 h-12 mb-4" /><p className="font-bold text-xl mb-2">載入失敗</p><p className="mb-6">{error}</p>
          <div className="flex gap-4">
            <button onClick={() => window.location.reload()} className="px-6 py-2 bg-bible-accent/20 rounded">重新整理</button>
            {isQuotaError && <button onClick={onOpenSettings} className="px-6 py-2 bg-bible-gold text-white rounded">前往設定</button>}
          </div>
        </div>
      ) : (
        <div className={`space-y-4 text-xl leading-loose text-bible-text font-medium transition-opacity duration-300 ${isTransitioning ? 'opacity-50' : 'opacity-100'}`}>
          {visibleVerses.map((v) => (
            <div key={v.verse} className="group hover:bg-bible-paper/50 rounded p-1 -mx-1 relative">
              <span className="text-xs text-bible-gold absolute -left-6 top-3 opacity-0 group-hover:opacity-100 w-4 text-right">{v.verse}</span>
              <span className="text-bible-red text-sm align-top opacity-60 group-hover:opacity-100">{v.verse}</span>
              <span> </span>
              <span>{v.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const SearchView = ({
  query,
  onNavigate
}: {
  query: string,
  onNavigate: (bookId: string, chapter: number) => void
}) => {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const doSearch = async () => {
      if (!query.trim()) return;
      setLoading(true);
      setError(null);
      try {
        const data = await searchBible(query);
        setResults(data);
      } catch (err: any) {
         setError(err.message || "搜尋失敗");
      } finally {
        setLoading(false);
      }
    };
    doSearch();
  }, [query]);

  return (
    <div className="w-full max-w-5xl mx-auto px-6 py-8 font-sans">
      <h2 className="text-2xl font-bold text-bible-text mb-6 flex items-center gap-2">
        <Search className="w-6 h-6 text-bible-gold" />
        搜尋結果："{query}"
        {!loading && !error && <span className="text-sm font-normal text-gray-500 ml-2">(共 {results.length} 筆)</span>}
      </h2>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-bible-gold"><Loader2 className="w-10 h-10 animate-spin mb-4" /><p>正在搜尋...</p></div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20 text-bible-red text-center"><AlertCircle className="w-12 h-12 mb-4" /><p className="font-bold">{error}</p></div>
      ) : results.length === 0 ? (
        <div className="text-center py-20 text-gray-500"><p>沒有找到相關經文。</p></div>
      ) : (
        <div className="space-y-4">
          {results.map((res: any, idx) => (
            <div 
              key={idx} 
              onClick={() => {
                let book = ALL_BOOKS.find(b => b.id === res.bookId);
                // Fallback for search results that might lack IDs (though service now provides them)
                if (!book) book = ALL_BOOKS.find(b => b.name === res.bookName || b.name === res.book || b.id === res.book);
                
                if (book) onNavigate(book.id, res.chapter);
                else alert(`無法跳轉：找不到書卷 "${res.bookName || res.book}"`);
              }}
              className="bg-white p-4 rounded-xl shadow-sm border border-bible-accent hover:border-bible-gold cursor-pointer transition-all group"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-bible-gold">{res.bookName || res.book} {res.chapter}:{res.verse}</span>
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-bible-gold" />
              </div>
              <p className="text-bible-text font-medium leading-relaxed">{res.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const SettingsModal = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
    const [importStatus, setImportStatus] = useState<'idle' | 'importing' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');
    const [dbCount, setDbCount] = useState(0);
    const [diagResult, setDiagResult] = useState<any>(null);
    const [diagLoading, setDiagLoading] = useState(false);
    const buildTime = new Date().toLocaleString('zh-TW');

    const refreshCount = async () => { try { setDbCount(await bibleDb.getChapterCount()); } catch (e) {} };
    const runDiagnosis = async () => {
        setDiagLoading(true); setDiagResult(null);
        try { setDiagResult(await diagnoseConnection()); } catch (e) { setDiagResult({ error: 'Diagnosis failed' }); } 
        finally { setDiagLoading(false); }
    };

    useEffect(() => { if (isOpen) { refreshCount(); setImportStatus('idle'); setMessage(''); setDiagResult(null); } }, [isOpen]);
    if (!isOpen) return null;

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]; if (!file) return;
        setImportStatus('importing'); setMessage('讀取中...');
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const json = JSON.parse(event.target?.result as string);
                setTimeout(async () => {
                    try {
                        const count = await bibleDb.importData(json);
                        setImportStatus('success'); setMessage(`成功匯入 ${count} 章！`);
                        await refreshCount();
                    } catch (err: any) { setImportStatus('error'); setMessage(err.message); }
                }, 100);
            } catch (err) { setImportStatus('error'); setMessage('JSON 格式錯誤'); }
        };
        reader.readAsText(file);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 font-sans">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-bible-paper">
                    <h3 className="font-bold text-lg flex items-center gap-2"><Database className="w-5 h-5 text-bible-gold" />系統設定與診斷</h3>
                    <button onClick={onClose}><X size={20} /></button>
                </div>
                <div className="p-6 overflow-y-auto space-y-8">
                    <div>
                        <h4 className="font-bold text-bible-text mb-4">離線資料庫 ({dbCount} 章)</h4>
                        <div className="space-y-4">
                            <p className="text-xs text-gray-500 bg-yellow-50 p-2 rounded">請下載 <strong>zh_cuv.json</strong> (和合本)。</p>
                            <a href="https://github.com/thiagobodruk/bible/blob/master/json/zh_cuv.json" target="_blank" className="flex items-center gap-3 p-3 border border-bible-gold bg-bible-paper/30 rounded-lg text-sm font-bold"><Github size={20} />下載 zh_cuv.json<ExternalLink size={16} className="ml-auto opacity-50" /></a>
                            <div className={`border-2 border-dashed rounded-xl p-6 text-center relative ${importStatus === 'error' ? 'bg-red-50 border-red-300' : 'border-bible-accent'}`}>
                                <input type="file" accept=".json" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" disabled={importStatus === 'importing'} />
                                <div className="flex flex-col items-center gap-2">
                                    {importStatus === 'importing' ? <Loader2 className="animate-spin text-bible-gold"/> : <Upload className="text-gray-400"/>}
                                    <span className="font-bold text-sm text-gray-600">{message || '上傳 JSON 檔案'}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="pt-6 border-t border-gray-100">
                        <h4 className="font-bold text-bible-text mb-4">系統診斷</h4>
                        <button onClick={runDiagnosis} disabled={diagLoading} className="w-full py-2 bg-gray-100 rounded-lg text-sm font-bold mb-4">{diagLoading ? '診斷中...' : '執行連線檢查'}</button>
                        {diagResult && (
                            <div className="bg-gray-900 text-gray-100 p-3 rounded-lg text-xs font-mono space-y-2">
                                <div className="flex justify-between"><span>Key Configured:</span><span className={diagResult.keyConfigured?'text-green-400':'text-red-400'}>{diagResult.keyConfigured?'YES':'NO'}</span></div>
                                <div className="flex justify-between"><span>Key Masked:</span><span className="text-yellow-400">{diagResult.keyMasked}</span></div>
                                <div className="flex justify-between"><span>Connection:</span><span className={diagResult.connection==='success'?'text-green-400':'text-red-400'}>{diagResult.connection}</span></div>
                                {diagResult.error && <div className="text-red-300 mt-2">{diagResult.error}</div>}
                            </div>
                        )}
                        <div className="mt-4 pt-4 border-t border-gray-100 text-[10px] text-gray-400"><Clock size={10} /> Build: {buildTime}</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const App: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [currentBookId, setCurrentBookId] = useState('gen');
  const [currentChapter, setCurrentChapter] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [view, setView] = useState<'read' | 'search'>('read');
  const [searchInput, setSearchInput] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => { if (window.innerWidth < 1024) setIsSidebarOpen(false); }, [currentBookId]);

  const currentBook = useMemo(() => ALL_BOOKS.find(b => b.id === currentBookId) || ALL_BOOKS[0], [currentBookId]);

  const handleSearchSubmit = () => {
    if (searchInput.trim()) {
      setSearchQuery(searchInput);
      setView('search');
      if (window.innerWidth < 1024) setIsSidebarOpen(false);
    }
  };

  const handleNavigate = (bookId: string, chapter: number) => {
    setCurrentBookId(bookId);
    setCurrentChapter(chapter);
    setView('read');
  };

  return (
    <div className="min-h-screen bg-[#fdfbf7] flex flex-col font-sans">
      <Header onSearchInput={setSearchInput} onMenuToggle={() => setIsSidebarOpen(!isSidebarOpen)} isMenuOpen={isSidebarOpen} onSearchSubmit={handleSearchSubmit} searchQuery={searchInput} onOpenSettings={() => setIsSettingsOpen(true)} />
      
      {/* 
         Main Container: Width 80% centered 
         Wrapped to create the 'Boxed' layout effect
      */}
      <div className="flex flex-1 pt-16 h-[calc(100vh)] overflow-hidden w-[80%] mx-auto shadow-2xl border-x border-bible-accent bg-bible-paper">
        <aside className={`fixed inset-y-0 left-0 pt-16 lg:static w-64 bg-bible-paper z-30 transition-transform duration-300 shadow-xl lg:shadow-none border-r border-bible-accent ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
          <BookList currentBookId={currentBookId} onSelectBook={(id) => { setCurrentBookId(id); setCurrentChapter(1); setView('read'); }} />
        </aside>
        {isSidebarOpen && <div className="fixed inset-0 bg-black/20 z-20 lg:hidden" onClick={() => setIsSidebarOpen(false)} />}
        <main className="flex-1 overflow-y-auto relative scroll-smooth bg-white/50">
          {view === 'read' ? <ChapterView book={currentBook} chapter={currentChapter} onChangeChapter={setCurrentChapter} onOpenSettings={() => setIsSettingsOpen(true)} /> : <SearchView query={searchQuery} onNavigate={handleNavigate} />}
        </main>
      </div>
      <VoiceAssistant />
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
};

export default App;