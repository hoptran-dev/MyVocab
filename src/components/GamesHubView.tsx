import { useEffect, useMemo, useState } from 'react';
import {
  Award,
  BarChart3,
  BellOff,
  CalendarClock,
  CheckSquare,
  ChevronDown,
  CloudRain,
  Flame,
  Headphones,
  Keyboard,
  LayoutGrid,
  List,
  Play,
  Settings,
  Shuffle,
  SlidersHorizontal,
  Table2,
  TrendingUp,
  Type as TypeIcon,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type {
  AppSettings,
  Deck,
  GameFilterConfig,
  GameModeId,
  GameOrderBy,
  GameStatusFilter,
  MatchHistoryItem,
  MemoryLevel,
  MixedExerciseType,
  VocabCard,
} from '../types/vocab';
import {
  DEFAULT_MIXED_MODES,
  SRS_LEVEL_SPECS,
  filterGameCards,
  formatNextReviewCountdown,
  getLevelDistribution,
  isCardDue,
  selectDeepMemoryReviewQueue,
} from '../utils/srs';
import { speakWord } from '../utils/speech';
import { GameStage } from './GameStage';
import { LevelRing } from './LevelRing';
import { Level6ConfigModal } from './Level6ConfigModal';

interface GamesHubViewProps {
  decks: Deck[];
  cards: VocabCard[];
  settings: AppSettings;
  presetDeckId?: string;
  autoStartMixed?: boolean;
  onConsumeAutoStart?: () => void;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onReviewCardInGame: (
    cardId: string,
    remembered: boolean
  ) => { justReachedLevel6: boolean; updatedCard: VocabCard | null; previousLevel?: MemoryLevel };
  onConfigureLevel6: (
    cardId: string,
    options: { noReview: boolean; reviewDays?: number }
  ) => void;
  onCompleteGame: (item: Omit<MatchHistoryItem, 'id' | 'playedAt'>) => void;
  onOpenAddWord: () => void;
}

interface GameModeSpec {
  id: Exclude<GameModeId, 'mixed'>;
  title: string;
  subtitle: string;
  gradient: string;
  shadowColor: string;
  icon: typeof List;
  isHot?: boolean;
}

const GAME_MODES: readonly GameModeSpec[] = [
  {
    id: 'flashcard',
    title: 'Flashcard',
    subtitle: 'Lật thẻ nhớ sâu từ vựng',
    gradient: 'linear-gradient(145deg, #7C6FF6 0%, #6C52D9 100%)',
    shadowColor: 'rgba(108, 82, 217, 0.28)',
    icon: List,
  },
  {
    id: 'quiz',
    title: 'Trắc Nghiệm (Có ảnh)',
    subtitle: 'Hiển thị ảnh minh họa + từ vựng chọn 1 trong 4 đáp án',
    gradient: 'linear-gradient(145deg, #FF9E00 0%, #FF6200 100%)',
    shadowColor: 'rgba(255, 115, 0, 0.28)',
    icon: CheckSquare,
  },
  {
    id: 'matching',
    title: 'Nối Từ (Matching)',
    subtitle: 'Ghép nhanh các cặp từ Anh–Việt trước khi hết giờ',
    gradient: 'linear-gradient(145deg, #1AA3FA 0%, #0284C7 100%)',
    shadowColor: 'rgba(2, 132, 199, 0.28)',
    icon: LayoutGrid,
  },
  {
    id: 'typing',
    title: 'Điền từ (Anh & Việt)',
    subtitle: 'Xem ảnh + gợi ý rồi gõ từ tiếng Anh hoặc nghĩa Việt',
    gradient: 'linear-gradient(145deg, #25B44D 0%, #16803C 100%)',
    shadowColor: 'rgba(22, 128, 60, 0.26)',
    icon: TypeIcon,
  },
  {
    id: 'dictation',
    title: 'Nghe & Viết lại',
    subtitle: 'Nghe phát âm (kèm ảnh gợi ý) và viết chính xác từ Anh',
    gradient: 'linear-gradient(145deg, #00AFC9 0%, #0277BD 100%)',
    shadowColor: 'rgba(2, 119, 189, 0.28)',
    icon: Headphones,
  },
  {
    id: 'rain',
    title: 'Mưa Từ Vựng',
    subtitle: 'Đọc nghĩa Việt đang rơi, nhớ và gõ từ tiếng Anh để bắn hạ',
    gradient: 'linear-gradient(145deg, #4F7BFF 0%, #3730A3 100%)',
    shadowColor: 'rgba(55, 48, 163, 0.28)',
    icon: CloudRain,
  },
  {
    id: 'speed',
    title: 'Luyện Gõ Tốc Độ',
    subtitle: 'Gõ thật nhanh các từ tiếng Anh đang rơi để luyện mặt chữ',
    gradient: 'linear-gradient(145deg, #14B8A6 0%, #0F766E 100%)',
    shadowColor: 'rgba(15, 118, 110, 0.28)',
    icon: Keyboard,
  },
  {
    id: 'special',
    title: 'Đặc biệt',
    subtitle: 'Thử thách hỗn hợp tổng hợp nhiều dạng bài',
    gradient: 'linear-gradient(145deg, #F67DC4 0%, #EC559B 100%)',
    shadowColor: 'rgba(236, 85, 155, 0.3)',
    icon: Shuffle,
    isHot: true,
  },
];

const MIXED_TOGGLE_OPTIONS: Array<{
  id: MixedExerciseType;
  label: string;
  icon: typeof CheckSquare;
}> = [
  { id: 'quiz', label: 'Trắc nghiệm', icon: CheckSquare },
  { id: 'dictation', label: 'Nghe viết', icon: Headphones },
  { id: 'typing', label: 'Gõ từ vựng', icon: TypeIcon },
  { id: 'flashcard', label: 'Flashcard', icon: List },
];

export function GamesHubView({
  decks,
  cards,
  settings,
  presetDeckId = 'all',
  autoStartMixed = false,
  onConsumeAutoStart,
  onUpdateSettings,
  onReviewCardInGame,
  onConfigureLevel6,
  onCompleteGame,
  onOpenAddWord,
}: GamesHubViewProps) {
  const [filterConfig, setFilterConfig] = useState<GameFilterConfig>({
    deckId: presetDeckId,
    statusFilter: 'unmastered',
    orderBy: 'random',
    quantity: 20,
    levelFilter: 'all',
  });

  const [chartViewMode, setChartViewMode] = useState<'chart' | 'table'>('chart');
  const [level6Filter, setLevel6Filter] = useState<'all' | 'scheduled' | 'archived'>('all');
  const [editingLevel6Card, setEditingLevel6Card] = useState<VocabCard | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const [activeGame, setActiveGame] = useState<{
    mode: GameModeId;
    cards: VocabCard[];
    deckName: string;
  } | null>(null);

  const mixedModes: MixedExerciseType[] =
    settings.mixedModes && settings.mixedModes.length > 0
      ? settings.mixedModes
      : [...DEFAULT_MIXED_MODES];

  useEffect(() => {
    setFilterConfig((prev) => ({ ...prev, deckId: presetDeckId }));
  }, [presetDeckId]);

  // Scope cards by selected deck for chart & Level 6 list
  const scopedCards = useMemo(
    () =>
      filterConfig.deckId === 'all'
        ? cards
        : cards.filter((c) => c.deckId === filterConfig.deckId),
    [cards, filterConfig.deckId]
  );

  const dist = useMemo(() => getLevelDistribution(scopedCards), [scopedCards]);

  // Count due cards per level for chart/table tooltip & details
  const dueByLevel = useMemo(() => {
    const map: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    const now = Date.now();
    for (const c of scopedCards) {
      if (isCardDue(c, now)) {
        const lvl = c.srs?.level ?? 0;
        map[lvl] = (map[lvl] || 0) + 1;
      }
    }
    return map;
  }, [scopedCards]);

  const maxLevelCount = useMemo(
    () => Math.max(1, ...SRS_LEVEL_SPECS.map((s) => dist[s.level])),
    [dist]
  );

  // Default review queue for Section 2 ("Ôn từ vựng ngay")
  const defaultReviewQueue = useMemo(
    () => selectDeepMemoryReviewQueue(cards, filterConfig.deckId, 20),
    [cards, filterConfig.deckId]
  );

  // Ready pool matching the 4 top filter boxes in Section 3
  const readyCards = useMemo(
    () =>
      filterGameCards(
        cards,
        { ...filterConfig, quantity: 'all' },
        Date.now(),
        () => 0.5
      ),
    [cards, filterConfig]
  );

  // Level 6 mastered cards for Section 4
  const level6Cards = useMemo(() => {
    const allL6 = scopedCards.filter((c) => c.srs?.level === 6);
    if (level6Filter === 'scheduled') return allL6.filter((c) => !c.srs.noReview);
    if (level6Filter === 'archived') return allL6.filter((c) => c.srs.noReview);
    return allL6;
  }, [scopedCards, level6Filter]);

  const totalLevel6Count = useMemo(
    () => scopedCards.filter((c) => c.srs?.level === 6).length,
    [scopedCards]
  );

  const launchMixedReview = (customDeckId?: string) => {
    const targetDeck = customDeckId ?? filterConfig.deckId;
    const queue = selectDeepMemoryReviewQueue(cards, targetDeck, 20);
    const deckName =
      targetDeck === 'all'
        ? 'Tất cả bộ từ'
        : decks.find((d) => d.id === targetDeck)?.name || 'Bộ từ vựng';

    setActiveGame({
      mode: 'mixed',
      cards: queue,
      deckName,
    });
  };

  useEffect(() => {
    if (autoStartMixed) {
      launchMixedReview(presetDeckId);
      onConsumeAutoStart?.();
    }
  }, [autoStartMixed]);

  const handleLaunchMode = (spec: GameModeSpec) => {
    const selectedPool = filterGameCards(cards, filterConfig);
    const deckName =
      filterConfig.deckId === 'all'
        ? 'Tất cả bộ từ'
        : decks.find((d) => d.id === filterConfig.deckId)?.name || 'Bộ từ vựng';

    setActiveGame({
      mode: spec.id,
      cards: selectedPool,
      deckName,
    });
  };

  const handleToggleMixedMode = (modeId: MixedExerciseType) => {
    const exists = mixedModes.includes(modeId);
    if (exists && mixedModes.length <= 1) return;
    const next = exists
      ? mixedModes.filter((m) => m !== modeId)
      : [...mixedModes, modeId];
    onUpdateSettings({ mixedModes: next });
  };

  const handleSelectChartLevel = (level: MemoryLevel) => {
    setFilterConfig((prev) => {
      if (prev.levelFilter === level) {
        return { ...prev, levelFilter: 'all', statusFilter: 'unmastered' };
      }
      return { ...prev, levelFilter: level, statusFilter: 'all' };
    });
  };

  const toggleQuickVolume = () => {
    const next = settings.audioVolume === 0 ? 70 : settings.audioVolume === 70 ? 100 : 0;
    onUpdateSettings({ audioVolume: next });
  };

  if (activeGame) {
    return (
      <GameStage
        mode={activeGame.mode}
        cards={activeGame.cards}
        allCards={cards}
        deckName={activeGame.deckName}
        settings={settings}
        mixedModes={mixedModes}
        onUpdateMixedModes={(next) => onUpdateSettings({ mixedModes: next })}
        onBack={() => setActiveGame(null)}
        onReplay={() => {
          const refreshed =
            activeGame.mode === 'mixed'
              ? selectDeepMemoryReviewQueue(cards, filterConfig.deckId, 20)
              : filterGameCards(cards, filterConfig);
          setActiveGame((prev) => (prev ? { ...prev, cards: refreshed } : null));
        }}
        onReviewCardInGame={onReviewCardInGame}
        onConfigureLevel6={onConfigureLevel6}
        onCompleteGame={onCompleteGame}
        onOpenAddWord={onOpenAddWord}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* ==================== PHẦN 1: BIỂU ĐỒ & BẢNG CÁC TỪ VỰNG NHỚ SÂU ==================== */}
      <section className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-xs space-y-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
                Biểu đồ từ vựng Nhớ sâu (6 cấp độ)
              </h2>
              {dist[0] > 0 && (
                <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-bold tabular-nums">
                  {dist[0]} từ mới chưa học
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Chơi game hoặc ôn tập tổng hợp trả lời đúng sẽ tự động nâng cấp độ nhớ từ Cấp 1 đến Cấp 6 (Nhớ sâu). Nhấn vào từng cột để lọc từ theo cấp độ.
            </p>
          </div>

          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200/80 shrink-0">
            <button
              type="button"
              onClick={() => setChartViewMode('chart')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                chartViewMode === 'chart'
                  ? 'bg-white text-blue-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Biểu đồ
            </button>
            <button
              type="button"
              onClick={() => setChartViewMode('table')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                chartViewMode === 'table'
                  ? 'bg-white text-blue-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Table2 className="w-3.5 h-3.5" />
              Bảng cấp độ
            </button>
          </div>
        </div>

        {chartViewMode === 'chart' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2">
            {SRS_LEVEL_SPECS.map((spec) => {
              const count = dist[spec.level];
              const dueHere = dueByLevel[spec.level] || 0;
              const pct = count === 0 ? 8 : Math.max(18, Math.round((count / maxLevelCount) * 100));
              const isSelected = filterConfig.levelFilter === spec.level;

              return (
                <button
                  key={spec.level}
                  type="button"
                  onClick={() => handleSelectChartLevel(spec.level)}
                  className={`group rounded-2xl border p-3.5 flex flex-col items-center justify-between transition-all cursor-pointer text-center ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50/50 ring-2 ring-blue-200'
                      : 'border-slate-200/90 bg-slate-50/40 hover:border-blue-300 hover:bg-white'
                  }`}
                >
                  {/* Column Bar Area */}
                  <div className="w-full h-24 flex flex-col items-center justify-end gap-1.5 pb-2">
                    <span
                      className="text-sm font-extrabold tabular-nums"
                      style={{ color: spec.badgeText }}
                    >
                      {count} từ
                    </span>
                    <div className="w-11 sm:w-12 h-16 rounded-xl bg-slate-200/60 flex items-end overflow-hidden p-1">
                      <div
                        className="w-full rounded-lg transition-all duration-300"
                        style={{
                          height: `${pct}%`,
                          backgroundColor: spec.color,
                          opacity: count === 0 ? 0.25 : 1,
                        }}
                      />
                    </div>
                  </div>

                  {/* Level Ring & Label */}
                  <div className="flex flex-col items-center gap-1 pt-2 border-t border-slate-200/70 w-full">
                    <div className="flex items-center gap-1.5">
                      <LevelRing level={spec.level} size={26} />
                      <span className="text-xs font-extrabold text-slate-900">
                        {spec.label}
                      </span>
                    </div>
                    <span className="text-[11px] font-medium text-slate-500">
                      {spec.level === 6 ? 'Sau 8 ngày / Tùy chọn' : spec.intervalLabel}
                    </span>
                    <span
                      className={`text-[10.5px] font-bold tabular-nums min-h-[16px] ${
                        dueHere > 0 ? 'text-blue-700' : 'text-emerald-600/80'
                      }`}
                    >
                      {dueHere > 0 ? `${dueHere} cần ôn` : count > 0 ? 'Đã ổn định' : '\u00A0'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200/90">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#EAF1FD] text-slate-800 text-xs sm:text-sm">
                  <th className="py-3 px-4 font-extrabold">Cấp độ nhớ</th>
                  <th className="py-3 px-4 font-extrabold">Chu kỳ nhắc lại</th>
                  <th className="py-3 px-4 font-extrabold text-right">Số từ hiện có</th>
                  <th className="py-3 px-4 font-extrabold text-right">Cần ôn</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {SRS_LEVEL_SPECS.map((spec, idx) => {
                  const isSelected = filterConfig.levelFilter === spec.level;
                  return (
                    <tr
                      key={spec.level}
                      onClick={() => handleSelectChartLevel(spec.level)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-blue-50'
                          : idx % 2 === 1
                            ? 'bg-slate-50/80 hover:bg-blue-50/40'
                            : 'bg-white hover:bg-blue-50/40'
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <LevelRing level={spec.level} size={30} />
                          <span className="font-bold text-slate-900">{spec.label}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-600 font-medium">
                        {spec.level === 6 ? 'Sau 8 ngày (Tùy chỉnh / Không ôn lại)' : spec.intervalLabel}
                      </td>
                      <td className="py-3 px-4 text-right font-extrabold text-slate-900 tabular-nums">
                        {dist[spec.level]} từ
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-blue-600 tabular-nums">
                        {dueByLevel[spec.level] || 0}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ==================== PHẦN 2: NÚT ÔN TỪ VỰNG TỔNG HỢP (MẶC ĐỊNH) ==================== */}
      <section className="rounded-3xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 p-5 sm:p-6 text-white shadow-lg shadow-blue-600/20 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h3 className="text-lg sm:text-xl font-extrabold tracking-tight">
                Ôn từ vựng tổng hợp
              </h3>
              <span className="px-2.5 py-0.5 rounded-full bg-white/20 text-white text-xs font-extrabold tabular-nums">
                {dist.due > 0
                  ? `${dist.due} từ đến hạn`
                  : `${defaultReviewQueue.length} từ sẵn sàng`}
              </span>
            </div>
            <p className="text-sm text-blue-100 font-medium max-w-2xl">
              Mặc định kết hợp Trắc nghiệm, Nghe viết, Gõ từ vựng và Flashcard trong cùng một phiên — trả lời đúng giúp tăng cấp độ nhớ sâu. Bạn có thể bật/tắt dạng bài ngay dưới đây hoặc đổi trực tiếp khi đang chơi.
            </p>
          </div>

          <button
            type="button"
            data-testid="start-mixed-review-btn"
            onClick={() => launchMixedReview()}
            className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-2xl bg-white text-blue-700 hover:bg-blue-50 font-extrabold text-sm sm:text-base shadow-md transition-transform hover:-translate-y-0.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Play className="w-4 h-4 fill-current" />
            Ôn từ vựng ngay
          </button>
        </div>

        {/* Quick exercise toggles before starting */}
        <div className="flex items-center justify-between flex-wrap gap-2.5 pt-3 border-t border-white/15">
          <div className="flex items-center gap-1.5 text-xs font-bold text-blue-100">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Dạng bài trong phiên ôn mặc định:</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {MIXED_TOGGLE_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const active = mixedModes.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => handleToggleMixedMode(opt.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                    active
                      ? 'bg-white text-blue-700 shadow-2xs'
                      : 'bg-white/15 text-white/75 hover:bg-white/25'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ==================== PHẦN 3: GAME — ĐÚNG TĂNG CẤP ĐỘ NHỚ ==================== */}
      <section className="space-y-4">
        {/* Action Header Row */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h3 className="text-lg font-extrabold text-slate-900">Game</h3>
            <button
              type="button"
              data-testid="game-settings-btn"
              onClick={() => setShowSettingsModal(true)}
              aria-label="Cài đặt bộ lọc và âm thanh game"
              title="Bộ lọc từ vựng & Cài đặt game"
              className="p-1.5 rounded-lg text-sky-500 hover:bg-sky-50 transition-colors cursor-pointer"
            >
              <Settings className="w-5 h-5" />
            </button>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200/70 px-2.5 py-1 rounded-full">
              <TrendingUp className="w-3.5 h-3.5" />
              Trả lời đúng → Tăng cấp độ nhớ
            </span>
            {filterConfig.levelFilter !== undefined && filterConfig.levelFilter !== 'all' && (
              <button
                type="button"
                onClick={() =>
                  setFilterConfig((prev) => ({
                    ...prev,
                    levelFilter: 'all',
                    statusFilter: 'unmastered',
                  }))
                }
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-900 text-white text-xs font-bold cursor-pointer"
              >
                Đang lọc: Cấp độ {filterConfig.levelFilter}
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={toggleQuickVolume}
              aria-label="Bật tắt hoặc chỉnh âm lượng đọc"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-100/90 text-emerald-700 hover:bg-emerald-200/80 text-xs font-extrabold tabular-nums transition-colors cursor-pointer"
            >
              {settings.audioVolume > 0 ? (
                <Volume2 className="w-3.5 h-3.5" />
              ) : (
                <VolumeX className="w-3.5 h-3.5" />
              )}
              <span>{settings.audioVolume}%</span>
            </button>

            <div
              data-testid="ready-words-count"
              className="px-3.5 py-1.5 rounded-full bg-emerald-100/90 text-emerald-800 text-xs font-extrabold tracking-wide tabular-nums"
            >
              {readyCards.length} TỪ SẴN SÀNG
            </div>
          </div>
        </div>

        {/* 8 Vibrant Gradient Game Cards (2 rows x 4 columns on desktop) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {GAME_MODES.map((spec) => {
            const Icon = spec.icon;
            return (
              <button
                key={spec.id}
                type="button"
                onClick={() => handleLaunchMode(spec)}
                style={{
                  background: spec.gradient,
                  boxShadow: `0 12px 24px -8px ${spec.shadowColor}`,
                }}
                className="group relative overflow-hidden rounded-[22px] p-5 min-h-[172px] flex flex-col items-center justify-center gap-3 text-center text-white transition-transform duration-200 hover:-translate-y-1 active:scale-[0.98] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/15"
                />

                {spec.isHot && (
                  <span className="absolute top-3 right-3 inline-flex items-center gap-0.5 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-rose-500 to-orange-500 text-[10.5px] font-extrabold tracking-wide text-white shadow-sm">
                    HOT
                    <Flame className="w-3 h-3 fill-amber-300 text-amber-200" />
                  </span>
                )}

                <div className="relative z-10 w-12 h-12 rounded-full bg-white/22 backdrop-blur-xs flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Icon className="w-6 h-6 text-white" />
                </div>

                <div className="relative z-10 space-y-1">
                  <div className="text-[16px] font-extrabold leading-tight">
                    {spec.title}
                  </div>
                  <div className="text-[12px] text-white/90 font-medium leading-snug line-clamp-2">
                    {spec.subtitle}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ==================== PHẦN 4: TỪ VỰNG ĐÃ ĐẠT CẤP ĐỘ 6 (NHỚ SÂU) ==================== */}
      <section className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <LevelRing level={6} size={40} />
            <div>
              <h3 className="text-lg font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                Từ vựng đã đạt Cấp độ 6 (Nhớ sâu)
                <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-extrabold tabular-nums">
                  {totalLevel6Count} từ
                </span>
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Tùy chỉnh chu kỳ nhắc lại riêng (8, 14, 30, 60 ngày hoặc tự nhập) hay chuyển sang Không ôn lại vĩnh viễn cho từng từ.
              </p>
            </div>
          </div>

          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200/70">
            {[
              { id: 'all' as const, label: 'Tất cả' },
              { id: 'scheduled' as const, label: 'Ôn định kỳ' },
              { id: 'archived' as const, label: 'Không ôn lại' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setLevel6Filter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  level6Filter === tab.id
                    ? 'bg-white text-blue-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {level6Cards.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 py-8 px-4 text-center space-y-1.5">
            <Award className="w-7 h-7 text-blue-400 mx-auto" />
            <p className="text-sm font-semibold text-slate-700">
              {totalLevel6Count === 0
                ? 'Chưa có từ vựng nào đạt Cấp độ 6.'
                : 'Không có từ nào trong nhóm lọc này.'}
            </p>
            <p className="text-xs text-slate-500">
              Hoàn thành các bài ôn tập và trò chơi ở trên để đưa từ vựng lên Cấp độ 6 — Nhớ sâu!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {level6Cards.map((card) => (
              <div
                key={card.id}
                className="rounded-2xl border border-slate-200/90 hover:border-blue-300 bg-slate-50/40 hover:bg-white p-4 flex items-center justify-between gap-3 transition-all"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <LevelRing level={6} size={34} noReview={card.srs.noReview} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-extrabold text-slate-900 text-sm truncate">
                        {card.word}
                      </span>
                      {card.ipa && (
                        <span className="text-xs font-mono text-slate-500">{card.ipa}</span>
                      )}
                      <button
                        type="button"
                        aria-label={`Phát âm ${card.word}`}
                        onClick={() => speakWord(card.word, settings)}
                        className="p-1 rounded-full text-slate-400 hover:text-blue-600 cursor-pointer"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="text-xs text-slate-600 truncate mt-0.5">
                      {card.meaning}
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                      {card.srs.noReview ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-200/80 text-slate-700 text-[11px] font-bold">
                          <BellOff className="w-3 h-3" />
                          Không ôn lại · Đã thuộc
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[11px] font-bold">
                          <CalendarClock className="w-3 h-3" />
                          Chu kỳ {card.srs.level6ReviewDays} ngày · {formatNextReviewCountdown(card.srs)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setEditingLevel6Card(card)}
                  className="px-3 py-1.5 rounded-xl border border-blue-200 bg-white hover:bg-blue-50 text-blue-700 text-xs font-bold shrink-0 cursor-pointer"
                >
                  Tùy chỉnh
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Level 6 Config Modal */}
      {editingLevel6Card && (
        <Level6ConfigModal
          card={editingLevel6Card}
          onSave={(id, opts) => {
            onConfigureLevel6(id, opts);
            setEditingLevel6Card(null);
          }}
          onClose={() => setEditingLevel6Card(null)}
        />
      )}

      {/* Game Settings Modal (includes the 4 filter dropdowns + audio & display settings) */}
      {showSettingsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Cài đặt game và bộ lọc từ vựng"
        >
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-lg p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-slate-900">Cài đặt Game & Bộ lọc</h3>
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                aria-label="Đóng cài đặt"
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 4 Filter Controls moved inside Settings */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                  Bộ lọc từ vựng
                </span>
                <span className="text-xs font-bold text-emerald-700 tabular-nums">
                  {readyCards.length} từ khớp bộ lọc
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 1. Bộ từ vựng */}
                <div className="space-y-1.5">
                  <label htmlFor="game-filter-deck" className="block text-xs font-bold text-slate-700">
                    Bộ từ vựng
                  </label>
                  <div className="relative">
                    <select
                      id="game-filter-deck"
                      value={filterConfig.deckId}
                      onChange={(e) =>
                        setFilterConfig((prev) => ({ ...prev, deckId: e.target.value }))
                      }
                      className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 py-2 pr-9 text-sm font-semibold text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer"
                    >
                      <option value="all">Tất cả bộ từ</option>
                      {decks.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-500 pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                {/* 2. Bộ lọc */}
                <div className="space-y-1.5">
                  <label htmlFor="game-filter-status" className="block text-xs font-bold text-slate-700">
                    Bộ lọc
                  </label>
                  <div className="relative">
                    <select
                      id="game-filter-status"
                      value={filterConfig.statusFilter}
                      onChange={(e) =>
                        setFilterConfig((prev) => ({
                          ...prev,
                          statusFilter: e.target.value as GameStatusFilter,
                          levelFilter: 'all',
                        }))
                      }
                      className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 py-2 pr-9 text-sm font-semibold text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer"
                    >
                      <option value="unmastered">Chưa thuộc</option>
                      <option value="due">Đến hạn ôn</option>
                      <option value="learning">Đang học (Cấp 1–5)</option>
                      <option value="level6">Đã nhớ sâu (Cấp 6)</option>
                      <option value="all">Tất cả từ</option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-500 pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                {/* 3. Thứ tự */}
                <div className="space-y-1.5">
                  <label htmlFor="game-filter-order" className="block text-xs font-bold text-slate-700">
                    Thứ tự
                  </label>
                  <div className="relative">
                    <select
                      id="game-filter-order"
                      value={filterConfig.orderBy}
                      onChange={(e) =>
                        setFilterConfig((prev) => ({
                          ...prev,
                          orderBy: e.target.value as GameOrderBy,
                        }))
                      }
                      className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 py-2 pr-9 text-sm font-semibold text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer"
                    >
                      <option value="random">Ngẫu nhiên</option>
                      <option value="newest">Mới thêm gần đây</option>
                      <option value="oldest">Cũ nhất trước</option>
                      <option value="az">Bảng chữ cái A → Z</option>
                      <option value="level_asc">Cấp độ thấp → cao</option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-500 pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                {/* 4. Số lượng */}
                <div className="space-y-1.5">
                  <label htmlFor="game-filter-qty" className="block text-xs font-bold text-slate-700">
                    Số lượng
                  </label>
                  <div className="relative">
                    <select
                      id="game-filter-qty"
                      value={String(filterConfig.quantity)}
                      onChange={(e) => {
                        const v = e.target.value;
                        setFilterConfig((prev) => ({
                          ...prev,
                          quantity: v === 'all' ? 'all' : Number(v),
                        }));
                      }}
                      className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 py-2 pr-9 text-sm font-semibold text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer"
                    >
                      <option value="10">10 từ</option>
                      <option value="20">20 từ</option>
                      <option value="30">30 từ</option>
                      <option value="50">50 từ</option>
                      <option value="all">Tất cả</option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-500 pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" />
                  </div>
                </div>
              </div>
            </div>

            {/* Audio & Display settings */}
            <div className="space-y-4 text-sm pt-4 border-t border-slate-100">
              <div className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                Âm thanh & Hiển thị
              </div>

              <div>
                <div className="flex justify-between font-semibold text-slate-700 mb-1.5">
                  <label htmlFor="game-audio-vol">Âm lượng phát âm</label>
                  <span className="tabular-nums text-blue-600">{settings.audioVolume}%</span>
                </div>
                <input
                  id="game-audio-vol"
                  type="range"
                  min={0}
                  max={100}
                  step={10}
                  value={settings.audioVolume}
                  onChange={(e) => onUpdateSettings({ audioVolume: Number(e.target.value) })}
                  className="w-full accent-blue-600"
                />
              </div>

              <label className="flex items-center justify-between gap-3 cursor-pointer py-1">
                <div>
                  <div className="font-semibold text-slate-800">Hiện ảnh minh họa gợi ý</div>
                  <div className="text-xs text-slate-500">
                    Hiển thị hình vẽ trực quan khi chơi Trắc nghiệm, Điền từ, Nghe viết
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.showImageHints}
                  onChange={(e) => onUpdateSettings({ showImageHints: e.target.checked })}
                  className="w-4 h-4 accent-blue-600"
                />
              </label>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="px-5 py-2 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 cursor-pointer"
              >
                Xong
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
