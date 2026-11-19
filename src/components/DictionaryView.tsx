import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Check,
  Database,
  Download,
  ExternalLink,
  Globe,
  Loader2,
  Plus,
  Search,
  Volume2,
  WifiOff,
} from 'lucide-react';
import type {
  AppSettings,
  Deck,
  GroundingSource,
  OfflineDictEntry,
  OfflineDictLookupResult,
} from '../types/vocab';
import {
  cacheDictEntries,
  ensureStaticOfflinePackLoaded,
  getCachedDictCount,
  lookupInBrowserCache,
  suggestFromBrowserCache,
} from '../utils/offlineDictCache';
import { apiUrl, parseApiJson, staticAssetUrl } from '../utils/api';
import { speakWord } from '../utils/speech';

interface DictionaryViewProps {
  decks: Deck[];
  settings: AppSettings;
  onAddWordFromDict: (
    deckId: string,
    item: { word: string; ipa: string; pos: string; meaning: string; example: string }
  ) => void;
  onShowToast: (msg: string) => void;
}

type DictTab = 'offline' | 'online_search';

const QUICK_SAMPLES = [
  'resilient',
  'streamline',
  'leverage',
  'break the ice',
  'ambitious',
  'kiên cường',
];

export function DictionaryView({
  decks,
  settings,
  onAddWordFromDict,
  onShowToast,
}: DictionaryViewProps) {
  const [activeTab, setActiveTab] = useState<DictTab>('offline');
  const [targetDeckId, setTargetDeckId] = useState(decks[0]?.id || '');
  const [query, setQuery] = useState('');

  // Offline dictionary stats & browser IndexedDB cache
  const [dbStats, setDbStats] = useState<{
    loaded: boolean;
    wordCount: number;
    definitionCount: number;
  }>({ loaded: false, wordCount: 0, definitionCount: 0 });
  const [cachedCount, setCachedCount] = useState(0);
  const [syncingPack, setSyncingPack] = useState(false);
  const [isOfflineNetwork, setIsOfflineNetwork] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );

  // Offline lookup & autocomplete state
  const [suggestions, setSuggestions] = useState<
    Array<{ word: string; preview: string; ipa: string }>
  >([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [offlineLoading, setOfflineLoading] = useState(false);
  const [offlineResult, setOfflineResult] = useState<OfflineDictLookupResult | null>(null);
  const [offlineError, setOfflineError] = useState('');
  const [recentLookups, setRecentLookups] = useState<string[]>([]);
  const [addedKeys, setAddedKeys] = useState<Set<string>>(new Set());

  // Online Google Search Grounding state
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResult, setSearchResult] = useState<{
    word: string;
    text: string;
    sources: GroundingSource[];
  } | null>(null);
  const [searchError, setSearchError] = useState('');

  const suggestBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onOnline = () => setIsOfflineNetwork(false);
    const onOffline = () => setIsOfflineNetwork(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Fetch local SQLite dictionary stats & browser cache count (with GitHub Pages static fallback)
  useEffect(() => {
    getCachedDictCount().then(setCachedCount);
    fetch(apiUrl('/api/dict/stats'))
      .then((r) =>
        r.ok && (r.headers.get('content-type') || '').includes('application/json')
          ? r.json()
          : null
      )
      .then(async (data) => {
        if (data?.loaded) {
          setDbStats({
            loaded: true,
            wordCount: data.wordCount || 0,
            definitionCount: data.definitionCount || 0,
          });
        } else {
          const count = await ensureStaticOfflinePackLoaded();
          if (count > 0) setCachedCount(count);
        }
      })
      .catch(async () => {
        // Static GitHub Pages or offline fallback — auto-seed bundled static dictionary pack
        const count = await ensureStaticOfflinePackLoaded();
        if (count > 0) setCachedCount(count);
      });
  }, []);

  // Close suggestion dropdown when clicking outside
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (suggestBoxRef.current && !suggestBoxRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Debounced autocomplete suggestions
  useEffect(() => {
    const trimmed = query.trim();
    if (activeTab !== 'offline' || trimmed.length < 1) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (!dbStats.loaded) {
        await ensureStaticOfflinePackLoaded();
        const fallback = await suggestFromBrowserCache(trimmed, 8);
        if (!cancelled) setSuggestions(fallback);
        return;
      }
      try {
        const res = await fetch(
          apiUrl(`/api/dict/suggest?q=${encodeURIComponent(trimmed)}&limit=8`)
        );
        if (!res.ok || !(res.headers.get('content-type') || '').includes('application/json')) {
          throw new Error('offline');
        }
        const data = await res.json();
        const list = Array.isArray(data.suggestions) ? data.suggestions : [];
        if (!cancelled) {
          setSuggestions(list);
        }
      } catch {
        await ensureStaticOfflinePackLoaded();
        const fallback = await suggestFromBrowserCache(trimmed, 8);
        if (!cancelled) setSuggestions(fallback);
      }
    }, 120);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, activeTab, dbStats.loaded]);

  const handleOfflineLookup = useCallback(async (overrideQuery?: string) => {
    const q = (overrideQuery ?? query).trim();
    if (!q) {
      setOfflineError('Vui lòng nhập từ tiếng Anh hoặc tiếng Việt cần tra.');
      return;
    }
    if (overrideQuery !== undefined) {
      setQuery(overrideQuery);
    }
    setShowSuggestions(false);
    setOfflineLoading(true);
    setOfflineError('');

    const runBrowserFallback = async () => {
      const cached = await lookupInBrowserCache(q);
      setOfflineResult(cached);
      setRecentLookups((prev) => [q, ...prev.filter((w) => w.toLowerCase() !== q.toLowerCase())].slice(0, 8));
      const count = await getCachedDictCount();
      setCachedCount(count);
      if (!cached.exact && cached.related.length === 0 && cached.reverseMatches.length === 0) {
        setOfflineError(
          'Chưa tìm thấy từ này trong gói từ điển offline trên trình duyệt.'
        );
      }
    };

    try {
      if (!dbStats.loaded) {
        await runBrowserFallback();
        return;
      }
      const res = await fetch(apiUrl(`/api/dict/lookup?q=${encodeURIComponent(q)}`));
      if (!res.ok || !(res.headers.get('content-type') || '').includes('application/json')) {
        throw new Error('Không thể truy cập máy chủ từ điển.');
      }
      const data = (await res.json()) as OfflineDictLookupResult;
      setOfflineResult(data);
      setRecentLookups((prev) => [q, ...prev.filter((w) => w.toLowerCase() !== q.toLowerCase())].slice(0, 8));

      // Cache exact match into browser IndexedDB for zero-network offline reuse
      if (data.exact) {
        cacheDictEntries([data.exact]).then(() => {
          getCachedDictCount().then(setCachedCount);
        });
      }
    } catch {
      await runBrowserFallback();
    } finally {
      setOfflineLoading(false);
    }
  }, [query, dbStats.loaded]);

  const handleSyncOfflinePack = async () => {
    setSyncingPack(true);
    try {
      let entries: OfflineDictEntry[] = [];
      const res = await fetch(apiUrl('/api/dict/offline-pack?limit=4000')).catch(() => null);
      if (res && res.ok && (res.headers.get('content-type') || '').includes('application/json')) {
        const data = await res.json();
        entries = Array.isArray(data.entries) ? (data.entries as OfflineDictEntry[]) : [];
      } else {
        const staticRes = await fetch(staticAssetUrl('dict-offline-pack.json'));
        if (!staticRes.ok) throw new Error('Không tải được gói từ điển offline.');
        const staticData = await staticRes.json();
        entries = Array.isArray(staticData.entries) ? (staticData.entries as OfflineDictEntry[]) : [];
      }
      const saved = await cacheDictEntries(entries);
      const total = await getCachedDictCount();
      setCachedCount(total);
      onShowToast(`Đã lưu ${saved.toLocaleString('vi-VN')} từ vựng vào bộ nhớ offline trình duyệt!`);
    } catch (err) {
      onShowToast(
        err instanceof Error ? err.message : 'Lỗi khi tải gói ngoại tuyến.'
      );
    } finally {
      setSyncingPack(false);
    }
  };

  const handleGoogleSearchGrounding = async (overrideQuery?: string) => {
    const q = (overrideQuery ?? query).trim();
    if (!q) {
      setSearchError('Vui lòng nhập từ, thành ngữ hoặc cụm từ cần tra thực tế.');
      return;
    }
    setSearchLoading(true);
    setSearchError('');
    try {
      const res = await fetch(apiUrl('/api/ai/search-lookup'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });
      const data = await parseApiJson<{ text?: string; sources?: GroundingSource[] }>(
        res,
        'Không thể tra cứu Google Search.'
      );
      setSearchResult({
        word: q,
        text: data.text || '',
        sources: Array.isArray(data.sources) ? data.sources : [],
      });
    } catch (err) {
      setSearchError(
        err instanceof Error ? err.message : 'Lỗi kết nối tra cứu Google Search.'
      );
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeTab === 'offline') {
      handleOfflineLookup();
    } else {
      handleGoogleSearchGrounding();
    }
  };

  const addDefinitionCard = (
    key: string,
    payload: { word: string; ipa: string; pos: string; meaning: string; example: string }
  ) => {
    onAddWordFromDict(targetDeckId || decks[0]?.id || '', payload);
    setAddedKeys((prev) => new Set(prev).add(key));
    onShowToast(`Đã thêm "${payload.word}" vào kho học Nhớ sâu!`);
  };

  // Group definitions by posLabel for cleaner reading
  const groupedDefs = useMemo(() => {
    if (!offlineResult?.exact) return [];
    const groups = new Map<
      string,
      { posLabel: string; pos: string; items: OfflineDictEntry['definitions'] }
    >();
    for (const def of offlineResult.exact.definitions) {
      const key = def.posLabel || 'Từ vựng';
      const existing = groups.get(key);
      if (existing) {
        existing.items.push(def);
      } else {
        groups.set(key, { posLabel: key, pos: def.pos, items: [def] });
      }
    }
    return Array.from(groups.values());
  }, [offlineResult]);

  return (
    <div className="space-y-5">
      {/* Mode Switcher, Target Deck & Offline Cache Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-white border border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab('offline')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors cursor-pointer ${
              activeTab === 'offline'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            Từ điển Offline (Anh–Việt)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('online_search')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors cursor-pointer ${
              activeTab === 'online_search'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Globe className="w-4 h-4" />
            Tra sâu Google Search
          </button>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {isOfflineNetwork && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold">
              <WifiOff className="w-3.5 h-3.5" />
              Đang ngoại tuyến
            </span>
          )}
          <div className="flex items-center gap-2">
            <label htmlFor="dict-target-deck" className="text-xs font-bold text-slate-600">
              Lưu vào bộ:
            </label>
            <select
              id="dict-target-deck"
              value={targetDeckId || decks[0]?.id || ''}
              onChange={(e) => setTargetDeckId(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800"
            >
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            disabled={syncingPack}
            onClick={handleSyncOfflinePack}
            title="Lưu sẵn 4.000 từ thông dụng vào bộ nhớ trình duyệt để tra ngay cả khi mất hoàn toàn kết nối"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:border-blue-400 text-xs font-bold text-slate-700 cursor-pointer disabled:opacity-60"
          >
            {syncingPack ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
            ) : (
              <Download className="w-3.5 h-3.5 text-blue-600" />
            )}
            <span>
              {cachedCount >= 1000 || (!dbStats.loaded && cachedCount > 0)
                ? `Bộ nhớ trình duyệt: ${cachedCount.toLocaleString('vi-VN')} từ`
                : dbStats.loaded
                  ? 'Lưu gói 4.000 từ về trình duyệt'
                  : 'Lưu gói từ điển offline'}
            </span>
          </button>
        </div>
      </div>

      {/* Search Bar with Autocomplete Dropdown */}
      <form
        onSubmit={handleSubmit}
        className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row gap-3"
      >
        <div ref={suggestBoxRef} className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            aria-label="Nhập từ tiếng Anh hoặc tiếng Việt cần tra cứu"
            value={query}
            onFocus={() => setShowSuggestions(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowSuggestions(true);
            }}
            placeholder={
              activeTab === 'offline'
                ? 'Tra từ tiếng Anh (resilient, streamline, take off) hoặc tiếng Việt (kiên cường)...'
                : 'Tra sắc thái hiện đại, thành ngữ, ví dụ báo chí trên Google Search...'
            }
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-900 focus:outline-none focus:border-blue-600"
          />

          {/* Instant Offline Autocomplete Suggestions */}
          {activeTab === 'offline' && showSuggestions && suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden divide-y divide-slate-100">
              {suggestions.map((s) => (
                <button
                  key={s.word}
                  type="button"
                  onClick={() => handleOfflineLookup(s.word)}
                  className="w-full px-4 py-2.5 text-left hover:bg-blue-50/70 flex items-center justify-between gap-3 cursor-pointer transition-colors"
                >
                  <div className="min-w-0 flex items-baseline gap-2">
                    <span className="font-bold text-sm text-slate-900">{s.word}</span>
                    {s.ipa && (
                      <span className="text-xs font-mono text-blue-600 shrink-0">{s.ipa}</span>
                    )}
                  </div>
                  {s.preview && (
                    <span className="text-xs text-slate-500 truncate max-w-[55%]">
                      {s.preview}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={activeTab === 'offline' ? offlineLoading : searchLoading}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-bold cursor-pointer whitespace-nowrap shrink-0"
        >
          {(activeTab === 'offline' ? offlineLoading : searchLoading) ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : activeTab === 'offline' ? (
            <Search className="w-4 h-4" />
          ) : (
            <Globe className="w-4 h-4" />
          )}
          {activeTab === 'offline' ? 'Tra từ offline' : 'Tra cứu Google Search'}
        </button>
      </form>

      {/* ==================== TAB 1: OFFLINE DICTIONARY RESULTS ==================== */}
      {activeTab === 'offline' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Main Definition Column */}
          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
            {offlineLoading ? (
              <div className="py-12 text-center text-sm text-slate-500 flex flex-col items-center gap-2">
                <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                <span>Đang tra từ điển offline...</span>
              </div>
            ) : offlineError && !offlineResult?.exact && !offlineResult?.reverseMatches.length ? (
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700 font-medium">
                {offlineError}
              </div>
            ) : offlineResult ? (
              <>
                {offlineResult.exact ? (
                  <div className="space-y-5">
                    {/* Word Header */}
                    <div className="flex items-start justify-between gap-4 flex-wrap pb-4 border-b border-slate-100">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <h3 className="text-3xl font-extrabold text-slate-900 tracking-tight">
                            {offlineResult.exact.word}
                          </h3>
                          <button
                            type="button"
                            onClick={() => speakWord(offlineResult.exact!.word, settings)}
                            aria-label={`Phát âm ${offlineResult.exact.word}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white text-xs font-bold transition-colors cursor-pointer"
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                            Nghe phát âm
                          </button>
                        </div>

                        {offlineResult.exact.pronunciations.length > 0 && (
                          <div className="flex items-center gap-2 flex-wrap">
                            {offlineResult.exact.pronunciations.map((p, idx) => (
                              <span
                                key={idx}
                                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-mono"
                              >
                                {p.region && (
                                  <span className="font-sans font-bold text-blue-700">
                                    {p.region}
                                  </span>
                                )}
                                {p.ipa}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Quick 1-click add top meaning */}
                      {offlineResult.exact.definitions[0] && (
                        <button
                          type="button"
                          onClick={() => {
                            const topDef = offlineResult.exact!.definitions[0];
                            const ipa = offlineResult.exact!.pronunciations[0]?.ipa || '';
                            addDefinitionCard(`exact-${offlineResult.exact!.word}`, {
                              word: offlineResult.exact!.word,
                              ipa,
                              pos: topDef.pos,
                              meaning: topDef.definition,
                              example: topDef.example,
                            });
                          }}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                        >
                          {addedKeys.has(`exact-${offlineResult.exact.word}`) ? (
                            <>
                              <Check className="w-4 h-4" />
                              Đã thêm vào kho học
                            </>
                          ) : (
                            <>
                              <Plus className="w-4 h-4" />
                              Thêm từ vào kho học
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    {/* Grouped Definitions by POS */}
                    <div className="space-y-5">
                      {groupedDefs.map((group) => (
                        <div key={group.posLabel} className="space-y-2.5">
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200/80 text-xs font-extrabold">
                              {group.posLabel}
                            </span>
                            {group.pos && (
                              <span className="text-xs font-mono text-slate-400">
                                ({group.pos})
                              </span>
                            )}
                          </div>

                          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200/80 overflow-hidden">
                            {group.items.map((def, i) => {
                              const defKey = `${offlineResult.exact!.word}-${group.posLabel}-${i}`;
                              const isAdded = addedKeys.has(defKey);
                              return (
                                <div
                                  key={defKey}
                                  className="p-3.5 hover:bg-slate-50/70 flex items-start justify-between gap-3 transition-colors"
                                >
                                  <div className="space-y-1 min-w-0">
                                    <div className="text-sm font-semibold text-slate-900 leading-relaxed">
                                      {def.definition}
                                    </div>
                                    {def.example && (
                                      <p className="text-xs text-slate-600 italic">
                                        VD: &ldquo;{def.example}&rdquo;
                                      </p>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      addDefinitionCard(defKey, {
                                        word: offlineResult.exact!.word,
                                        ipa: offlineResult.exact!.pronunciations[0]?.ipa || '',
                                        pos: def.pos,
                                        meaning: def.definition,
                                        example: def.example,
                                      })
                                    }
                                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold shrink-0 cursor-pointer transition-colors ${
                                      isAdded
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        : 'bg-slate-100 hover:bg-blue-600 text-slate-700 hover:text-white'
                                    }`}
                                  >
                                    {isAdded ? (
                                      <>
                                        <Check className="w-3.5 h-3.5" />
                                        Đã lưu
                                      </>
                                    ) : (
                                      <>
                                        <Plus className="w-3.5 h-3.5" />
                                        Lưu nghĩa này
                                      </>
                                    )}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : offlineResult.reverseMatches.length > 0 ? (
                  <div className="space-y-4">
                    <div className="pb-3 border-b border-slate-100">
                      <h3 className="text-base font-extrabold text-slate-900">
                        Kết quả tra ngược Việt → Anh cho &ldquo;{offlineResult.query}&rdquo;
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Nhấn vào từng từ tiếng Anh để xem chi tiết đầy đủ hoặc bấm Lưu vào kho học
                      </p>
                    </div>
                    <div className="divide-y divide-slate-100 rounded-xl border border-slate-200/80 overflow-hidden">
                      {offlineResult.reverseMatches.map((m, idx) => {
                        const revKey = `rev-${m.word}-${idx}`;
                        const isAdded = addedKeys.has(revKey);
                        return (
                          <div
                            key={revKey}
                            className="p-3.5 flex items-start justify-between gap-3 hover:bg-slate-50/70"
                          >
                            <div className="min-w-0 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => handleOfflineLookup(m.word)}
                                  className="text-base font-extrabold text-blue-700 hover:underline cursor-pointer"
                                >
                                  {m.word}
                                </button>
                                {m.posLabel && (
                                  <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                                    {m.posLabel}
                                  </span>
                                )}
                                {m.ipa && (
                                  <span className="text-xs font-mono text-slate-500">
                                    {m.ipa}
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => speakWord(m.word, settings)}
                                  aria-label={`Phát âm ${m.word}`}
                                  className="p-1 rounded-full text-slate-400 hover:text-blue-600 cursor-pointer"
                                >
                                  <Volume2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <div className="text-sm text-slate-700">{m.definition}</div>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                addDefinitionCard(revKey, {
                                  word: m.word,
                                  ipa: m.ipa,
                                  pos: m.pos,
                                  meaning: m.definition,
                                  example: '',
                                })
                              }
                              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold shrink-0 cursor-pointer ${
                                isAdded
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-blue-600 hover:bg-blue-700 text-white'
                              }`}
                            >
                              {isAdded ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                              {isAdded ? 'Đã lưu' : 'Thêm'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="py-10 text-center space-y-3">
                    <p className="text-sm font-semibold text-slate-700">
                      Không tìm thấy chính xác &ldquo;{offlineResult.query}&rdquo; trong từ điển offline.
                    </p>
                    <p className="text-xs text-slate-500">
                      Bạn có thể chọn từ gợi ý bên cạnh hoặc chuyển sang tab Tra sâu Google Search cho cụm từ/thành ngữ mới.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('online_search');
                        handleGoogleSearchGrounding(offlineResult.query);
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-bold cursor-pointer"
                    >
                      <Globe className="w-3.5 h-3.5" />
                      Tra &ldquo;{offlineResult.query}&rdquo; bằng Google Search
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="py-10 text-center space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                  <Database className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-extrabold text-slate-900">
                    Sẵn sàng tra cứu Offline Anh–Việt & Việt–Anh
                  </h3>
                  <p className="text-sm text-slate-500 max-w-lg mx-auto">
                    Gõ bất kỳ từ tiếng Anh hoặc nghĩa tiếng Việt nào ở thanh tìm kiếm phía trên. Gợi ý từ sẽ hiện ngay lập tức.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2 flex-wrap pt-1">
                  {QUICK_SAMPLES.map((sample) => (
                    <button
                      key={sample}
                      type="button"
                      onClick={() => handleOfflineLookup(sample)}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 text-xs font-bold cursor-pointer transition-colors"
                    >
                      {sample}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Sidebar: Related Words, Reverse Matches & Recent */}
          <div className="lg:col-span-4 space-y-4">
            {offlineResult && offlineResult.related.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
                <h4 className="text-sm font-extrabold text-slate-900">
                  Từ & cụm từ liên quan
                </h4>
                <div className="divide-y divide-slate-100">
                  {offlineResult.related.map((r) => (
                    <button
                      key={r.word}
                      type="button"
                      onClick={() => handleOfflineLookup(r.word)}
                      className="w-full py-2.5 text-left hover:bg-slate-50 px-2 -mx-2 rounded-lg transition-colors cursor-pointer"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-bold text-blue-700">{r.word}</span>
                        {r.ipa && (
                          <span className="text-[11px] font-mono text-slate-400 shrink-0">
                            {r.ipa}
                          </span>
                        )}
                      </div>
                      {r.preview && (
                        <div className="text-xs text-slate-500 truncate mt-0.5">
                          {r.preview}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {recentLookups.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
                <h4 className="text-sm font-extrabold text-slate-900">Vừa tra gần đây</h4>
                <div className="flex flex-wrap gap-2">
                  {recentLookups.map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => handleOfflineLookup(w)}
                      className="px-3 py-1 rounded-lg bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 text-xs font-semibold cursor-pointer"
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-2 text-xs text-slate-600">
              <div className="font-extrabold text-slate-800 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-blue-600" />
                Nguồn dữ liệu từ điển Offline
              </div>
              <p className="leading-relaxed">
                {dbStats.loaded ? (
                  <>
                    Tích hợp trực tiếp cơ sở dữ liệu{' '}
                    <strong className="text-slate-800">
                      skypediacode/english-vietnamese-dictionary
                    </strong>{' '}
                    ({dbStats.wordCount.toLocaleString('vi-VN')} từ), hỗ trợ tra từ cực nhanh không
                    cần Internet và tự động lưu đệm vào trình duyệt.
                  </>
                ) : (
                  <>
                    Chế độ web tĩnh (GitHub Pages / Offline) đang sử dụng gói từ điển Anh–Việt &amp;
                    Việt–Anh lưu trực tiếp trên trình duyệt (
                    <strong className="text-slate-800">
                      {cachedCount.toLocaleString('vi-VN')} mục từ
                    </strong>
                    ), tra cứu tức thì không cần máy chủ.
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ==================== TAB 2: ONLINE GOOGLE SEARCH GROUNDING ==================== */}
      {activeTab === 'online_search' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-xs">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-blue-600" />
              <h3 className="text-base font-extrabold text-slate-900">
                Ngữ cảnh, Collocations & Ví dụ thực tế (Google Search)
              </h3>
            </div>
            {searchResult && (
              <button
                type="button"
                onClick={() => speakWord(searchResult.word, settings)}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-50 text-blue-700 text-xs font-bold hover:bg-blue-100 cursor-pointer"
              >
                <Volume2 className="w-3.5 h-3.5" />
                Nghe phát âm
              </button>
            )}
          </div>

          {searchLoading ? (
            <div className="py-10 text-center text-sm text-slate-500 flex flex-col items-center gap-2">
              <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
              <span>Đang tìm kiếm dữ liệu thực tế mới nhất từ Google Search...</span>
            </div>
          ) : searchError ? (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700 font-medium">
              {searchError}
            </div>
          ) : searchResult ? (
            <div className="space-y-4">
              <div className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                {searchResult.text}
              </div>

              {searchResult.sources.length > 0 && (
                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <div className="text-xs font-bold text-slate-500">
                    Nguồn tham khảo từ Google Search:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {searchResult.sources.map((src, idx) => (
                      <a
                        key={idx}
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 hover:border-blue-400 text-xs font-semibold text-blue-700 max-w-full truncate"
                      >
                        <ExternalLink className="w-3 h-3 shrink-0" />
                        <span className="truncate max-w-[240px]">{src.title}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-slate-500 space-y-3">
              <p>
                Nhập từ khóa, thành ngữ hoặc cụm từ mới phía trên để tra cứu sắc thái sử dụng hiện đại và ví dụ thực tế từ nguồn web.
              </p>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                {['resilient', 'break the ice', 'streamline', 'take for granted'].map(
                  (sample) => (
                    <button
                      key={sample}
                      type="button"
                      onClick={() => {
                        setQuery(sample);
                        handleGoogleSearchGrounding(sample);
                      }}
                      className="px-3 py-1 rounded-lg bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 text-xs font-semibold cursor-pointer"
                    >
                      {sample}
                    </button>
                  )
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
