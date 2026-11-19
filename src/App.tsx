import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AppSettings,
  AppState,
  ExtractedWordCandidate,
  MatchHistoryItem,
  ViewId,
  VocabCard,
} from './types/vocab';
import {
  DAY_MS,
  configureLevel6Schedule,
  createInitialSRS,
  createSeedState,
  evaluateSrsReview,
  isCardDue,
  normalizeSRS,
  todayDateString,
} from './utils/srs';
import { loadAppState, saveAppState, uid } from './utils/storage';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { GamesHubView } from './components/GamesHubView';
import { AiExtractorView } from './components/AiExtractorView';
import { DictionaryView } from './components/DictionaryView';
import { VocabManagerView } from './components/VocabManagerView';
import { BulkImportModal, NewDeckModal, WordModal } from './components/Modals';
import { OfflineIndicator } from './components/OfflineIndicator';

export default function App() {
  const [state, setState] = useState<AppState>(() => createSeedState());
  const [hydrated, setHydrated] = useState(false);
  const [activeView, setActiveView] = useState<ViewId>('games');
  const [presetDeckId, setPresetDeckId] = useState<string>('all');
  const [autoStartMixed, setAutoStartMixed] = useState(false);

  // Modals
  const [wordModal, setWordModal] = useState<{
    open: boolean;
    editingCard: VocabCard | null;
    deckId?: string;
  }>({ open: false, editingCard: null });
  const [newDeckModalOpen, setNewDeckModalOpen] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Support optional ?view= query param for deep linking
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rawView = params.get('view');
    if (rawView === 'srs') {
      setActiveView('games');
    } else if (
      rawView &&
      ['dashboard', 'games', 'ai', 'dictionary', 'vocab'].includes(rawView)
    ) {
      setActiveView(rawView as ViewId);
    }
  }, []);

  // Load persisted IndexedDB state
  useEffect(() => {
    let mounted = true;
    loadAppState().then((loaded) => {
      if (mounted) {
        setState(loaded);
        setHydrated(true);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Persist on state changes after hydration
  useEffect(() => {
    if (hydrated) {
      saveAppState(state);
    }
  }, [state, hydrated]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2800);
  }, []);

  const dueCount = useMemo(
    () => state.cards.filter((c) => isCardDue(c)).length,
    [state.cards]
  );

  const bumpActivity = (prevStats: AppState['stats'], deltaCount = 1, deltaCoins = 0) => {
    const today = todayDateString();
    let streak = prevStats.streak || 0;
    let todayCount = prevStats.todayCount || 0;
    if (prevStats.lastDate !== today) {
      const gap = prevStats.lastDate
        ? (new Date(today).getTime() - new Date(prevStats.lastDate).getTime()) / DAY_MS
        : 99;
      streak = gap <= 1.5 ? streak + 1 : 1;
      todayCount = 0;
    }
    return {
      ...prevStats,
      streak,
      lastDate: today,
      todayCount: todayCount + deltaCount,
      coins: (prevStats.coins || 0) + deltaCoins,
    };
  };

  const handleUpdateSettings = useCallback((patch: Partial<AppSettings>) => {
    setState((prev) => ({
      ...prev,
      settings: { ...prev.settings, ...patch },
    }));
  }, []);

  const handleReviewCard = useCallback(
    (cardId: string, remembered: boolean) => {
      const target = state.cards.find((c) => c.id === cardId);
      if (!target) {
        return { justReachedLevel6: false, updatedCard: null };
      }
      const previousLevel = target.srs.level;
      const outcome = evaluateSrsReview(target.srs, remembered);
      const updatedCard: VocabCard = { ...target, srs: outcome.nextSrs };

      setState((prev) => ({
        ...prev,
        cards: prev.cards.map((c) => (c.id === cardId ? updatedCard : c)),
        stats: bumpActivity(prev.stats, 1, 0),
      }));

      return {
        justReachedLevel6: outcome.justReachedLevel6,
        updatedCard,
        previousLevel,
      };
    },
    [state.cards]
  );

  const handleConfigureLevel6 = useCallback(
    (cardId: string, options: { noReview: boolean; reviewDays?: number }) => {
      setState((prev) => ({
        ...prev,
        cards: prev.cards.map((c) =>
          c.id === cardId
            ? { ...c, srs: configureLevel6Schedule(c.srs, options) }
            : c
        ),
      }));
      showToast(
        options.noReview
          ? 'Đã chuyển từ sang chế độ Không ôn lại!'
          : `Đã đặt lịch ôn lại sau ${options.reviewDays ?? 8} ngày!`
      );
    },
    [showToast]
  );

  const handleCompleteGame = useCallback(
    (item: Omit<MatchHistoryItem, 'id' | 'playedAt'>) => {
      showToast(`Hoàn thành ${item.modeLabel}!`);
    },
    [showToast]
  );


  const handleSaveWord = useCallback(
    (payload: {
      id?: string;
      deckId: string;
      word: string;
      pos: string;
      ipa: string;
      meaning: string;
      example: string;
      image: string;
    }) => {
      if (payload.id) {
        setState((prev) => ({
          ...prev,
          cards: prev.cards.map((c) =>
            c.id === payload.id
              ? {
                  ...c,
                  deckId: payload.deckId,
                  word: payload.word,
                  pos: payload.pos,
                  ipa: payload.ipa,
                  meaning: payload.meaning,
                  example: payload.example,
                  image: payload.image,
                }
              : c
          ),
        }));
        showToast('Đã cập nhật từ vựng!');
      } else {
        const newCard: VocabCard = {
          id: uid('card'),
          deckId: payload.deckId,
          word: payload.word,
          pos: payload.pos,
          ipa: payload.ipa,
          meaning: payload.meaning,
          example: payload.example,
          image: payload.image,
          createdAt: Date.now(),
          srs: createInitialSRS(),
        };
        setState((prev) => ({
          ...prev,
          cards: [newCard, ...prev.cards],
        }));
        showToast(`Đã thêm "${payload.word}" vào bộ thẻ!`);
      }
      setWordModal({ open: false, editingCard: null });
    },
    [showToast]
  );

  const handleSaveExtractedWords = useCallback(
    (deckId: string, newDeckName: string | null, items: ExtractedWordCandidate[]) => {
      const now = Date.now();
      let resolvedDeckId = deckId;
      let createdDeck = null as AppState['decks'][number] | null;

      if (newDeckName) {
        resolvedDeckId = uid('deck');
        createdDeck = {
          id: resolvedDeckId,
          name: newDeckName,
          desc: 'Tách từ vựng theo ngữ cảnh bằng AI',
        };
      }

      const newCards: VocabCard[] = items.map((it, idx) => ({
        id: uid('card'),
        deckId: resolvedDeckId,
        word: it.word,
        pos: it.pos,
        ipa: it.ipa,
        meaning: it.meaning,
        example: it.contextSentence,
        contextNote: it.generalMeaning ? `Nghĩa khác: ${it.generalMeaning}` : '',
        cefr: it.cefr,
        image: it.image,
        createdAt: now - idx,
        srs: createInitialSRS(now),
      }));

      setState((prev) => ({
        ...prev,
        decks: createdDeck ? [...prev.decks, createdDeck] : prev.decks,
        cards: [...newCards, ...prev.cards],
      }));

      showToast(`Đã lưu ${newCards.length} từ vựng đã chọn vào kho học!`);
    },
    [showToast]
  );

  const handleAddWordFromDict = useCallback(
    (
      deckId: string,
      item: { word: string; ipa: string; pos: string; meaning: string; example: string }
    ) => {
      const card: VocabCard = {
        id: uid('card'),
        deckId: deckId || state.decks[0]?.id || 'deck_default',
        word: item.word,
        ipa: item.ipa,
        pos: item.pos,
        meaning: item.meaning,
        example: item.example,
        image: '',
        createdAt: Date.now(),
        srs: createInitialSRS(),
      };
      setState((prev) => ({
        ...prev,
        cards: [card, ...prev.cards],
      }));
    },
    [state.decks]
  );

  const handleDeleteWords = useCallback(
    (ids: string[]) => {
      const idSet = new Set(ids);
      setState((prev) => ({
        ...prev,
        cards: prev.cards.filter((c) => !idSet.has(c.id)),
      }));
      showToast(`Đã xóa ${ids.length} từ vựng!`);
    },
    [showToast]
  );

  const handleCreateDeck = useCallback(
    (name: string, desc: string) => {
      setState((prev) => ({
        ...prev,
        decks: [...prev.decks, { id: uid('deck'), name, desc }],
      }));
      setNewDeckModalOpen(false);
      showToast(`Đã tạo bộ thẻ "${name}"!`);
    },
    [showToast]
  );

  const handleDeleteDeck = useCallback(
    (deckId: string) => {
      setState((prev) => {
        if (prev.decks.length <= 1) {
          return { ...prev, cards: [] };
        }
        return {
          ...prev,
          decks: prev.decks.filter((d) => d.id !== deckId),
          cards: prev.cards.filter((c) => c.deckId !== deckId),
        };
      });
      showToast('Đã xóa bộ thẻ!');
    },
    [showToast]
  );

  const handleBulkImport = useCallback(
    (
      deckId: string,
      items: Array<{ word: string; meaning: string; ipa: string; example: string }>
    ) => {
      const now = Date.now();
      const newCards: VocabCard[] = items.map((it, idx) => ({
        id: uid('card'),
        deckId,
        word: it.word,
        meaning: it.meaning,
        ipa: it.ipa,
        example: it.example,
        pos: '',
        image: '',
        createdAt: now - idx,
        srs: createInitialSRS(now),
      }));
      setState((prev) => ({
        ...prev,
        cards: [...newCards, ...prev.cards],
      }));
      setBulkModalOpen(false);
      showToast(`Đã nhập ${newCards.length} từ vựng mới!`);
    },
    [showToast]
  );

  const handleExportBackup = useCallback(() => {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MyVocab_Backup_${todayDateString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Đã xuất file sao lưu JSON!');
  }, [state, showToast]);

  const handleImportBackup = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result || '{}')) as Partial<AppState>;
          if (Array.isArray(parsed.decks) && Array.isArray(parsed.cards)) {
            const now = Date.now();
            setState((prev) => ({
              ...prev,
              decks: parsed.decks!.length ? parsed.decks! : prev.decks,
              cards: parsed.cards!.map((c, idx) => ({
                ...c,
                createdAt: typeof c.createdAt === 'number' ? c.createdAt : now - idx * 1000,
                srs: normalizeSRS(c.srs, now),
              })),
              history: Array.isArray(parsed.history) ? parsed.history : prev.history,
            }));
            showToast('Đã khôi phục dữ liệu từ bản sao lưu!');
          } else {
            showToast('File sao lưu không đúng định dạng MyVocab.');
          }
        } catch {
          showToast('Không đọc được file JSON sao lưu.');
        }
      };
      reader.readAsText(file);
    },
    [showToast]
  );

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#F6F8FC] text-slate-900">
      <Sidebar
        activeView={activeView}
        onSelectView={(v) => {
          setActiveView(v);
          setAutoStartMixed(false);
        }}
        dueCount={dueCount}
        settings={state.settings}
        onUpdateSettings={handleUpdateSettings}
      />

      <main className="flex-1 w-full max-w-[1280px] mx-auto px-4 py-6 sm:px-7 lg:px-9 lg:py-7">
        {activeView === 'dashboard' && (
          <DashboardView
            decks={state.decks}
            cards={state.cards}
            stats={state.stats}
            onOpenNewDeck={() => setNewDeckModalOpen(true)}
            onOpenAddWord={(deckId) =>
              setWordModal({ open: true, editingCard: null, deckId })
            }
            onDeleteDeck={handleDeleteDeck}
            onStartSrsForDeck={(deckId) => {
              setPresetDeckId(deckId);
              setAutoStartMixed(true);
              setActiveView('games');
            }}
            onStartGamesForDeck={(deckId) => {
              setPresetDeckId(deckId);
              setAutoStartMixed(false);
              setActiveView('games');
            }}
            onGoToAiExtractor={() => setActiveView('ai')}
            onGoToSrs={() => {
              setPresetDeckId('all');
              setAutoStartMixed(false);
              setActiveView('games');
            }}
          />
        )}

        {activeView === 'games' && (
          <GamesHubView
            decks={state.decks}
            cards={state.cards}
            settings={state.settings}
            presetDeckId={presetDeckId}
            autoStartMixed={autoStartMixed}
            onConsumeAutoStart={() => setAutoStartMixed(false)}
            onUpdateSettings={handleUpdateSettings}
            onReviewCardInGame={handleReviewCard}
            onConfigureLevel6={handleConfigureLevel6}
            onCompleteGame={handleCompleteGame}
            onOpenAddWord={() => setWordModal({ open: true, editingCard: null })}
          />
        )}

        {activeView === 'ai' && (
          <AiExtractorView
            decks={state.decks}
            settings={state.settings}
            onSaveExtractedWords={handleSaveExtractedWords}
            onOpenNewDeck={() => setNewDeckModalOpen(true)}
            onOpenAddWord={() => setWordModal({ open: true, editingCard: null })}
            onShowToast={showToast}
          />
        )}

        {activeView === 'dictionary' && (
          <DictionaryView
            decks={state.decks}
            settings={state.settings}
            onAddWordFromDict={handleAddWordFromDict}
            onShowToast={showToast}
          />
        )}

        {activeView === 'vocab' && (
          <VocabManagerView
            decks={state.decks}
            cards={state.cards}
            settings={state.settings}
            onOpenAddWord={(deckId) =>
              setWordModal({ open: true, editingCard: null, deckId })
            }
            onOpenEditWord={(card) =>
              setWordModal({ open: true, editingCard: card })
            }
            onOpenBulkImport={() => setBulkModalOpen(true)}
            onDeleteWords={handleDeleteWords}
            onConfigureLevel6={handleConfigureLevel6}
            onExportBackup={handleExportBackup}
            onImportBackup={handleImportBackup}
          />
        )}
      </main>

      {/* Modals */}
      {wordModal.open && (
        <WordModal
          decks={state.decks}
          settings={state.settings}
          editingCard={wordModal.editingCard}
          presetDeckId={wordModal.deckId}
          onSave={handleSaveWord}
          onClose={() => setWordModal({ open: false, editingCard: null })}
          onShowToast={showToast}
        />
      )}

      {newDeckModalOpen && (
        <NewDeckModal
          onSave={handleCreateDeck}
          onClose={() => setNewDeckModalOpen(false)}
        />
      )}

      {bulkModalOpen && (
        <BulkImportModal
          decks={state.decks}
          onImport={handleBulkImport}
          onClose={() => setBulkModalOpen(false)}
        />
      )}

      {/* Offline Connectivity Indicator */}
      <OfflineIndicator />

      {/* Toast Notification */}
      <div
        role="status"
        aria-live="polite"
        className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold shadow-xl transition-all duration-200 ${
          toast ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0 pointer-events-none'
        }`}
      >
        {toast}
      </div>
    </div>
  );
}
