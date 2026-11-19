import { useMemo } from 'react';
import {
  Brain,
  FileText,
  Flame,
  Gamepad2,
  Plus,
  Trash2,
} from 'lucide-react';
import type { AppStats, Deck, VocabCard } from '../types/vocab';
import {
  SRS_LEVEL_SPECS,
  getLevelDistribution,
  isCardDue,
} from '../utils/srs';
import { LevelRing } from './LevelRing';

interface DashboardViewProps {
  decks: Deck[];
  cards: VocabCard[];
  stats: AppStats;
  onOpenNewDeck: () => void;
  onOpenAddWord: (deckId?: string) => void;
  onDeleteDeck: (deckId: string) => void;
  onStartSrsForDeck: (deckId: string) => void;
  onStartGamesForDeck: (deckId: string) => void;
  onGoToAiExtractor: () => void;
  onGoToSrs: () => void;
}

export function DashboardView({
  decks,
  cards,
  stats,
  onOpenNewDeck,
  onOpenAddWord,
  onDeleteDeck,
  onStartSrsForDeck,
  onStartGamesForDeck,
  onGoToAiExtractor,
  onGoToSrs,
}: DashboardViewProps) {
  const dist = useMemo(() => getLevelDistribution(cards), [cards]);
  const goalPct = Math.min(
    100,
    Math.round(((stats.todayCount || 0) / Math.max(1, stats.dailyGoal || 20)) * 100)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Tổng quan học tập
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Học từ vựng đa giác quan cùng MyVocab: Nhớ sâu 6 cấp độ · Game · AI tách văn bản
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={onOpenNewDeck}
            className="px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 hover:border-blue-400 text-slate-700 text-sm font-semibold cursor-pointer"
          >
            + Bộ thẻ mới
          </button>
          <button
            type="button"
            onClick={onGoToAiExtractor}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 text-sm font-bold cursor-pointer"
          >
            <FileText className="w-4 h-4" />
            AI tách văn bản
          </button>
          <button
            type="button"
            onClick={() => onOpenAddWord()}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Thêm từ mới
          </button>
        </div>
      </div>

      {/* 4 Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2 shadow-2xs">
          <div className="text-xs font-semibold text-slate-500">Mục tiêu hôm nay</div>
          <div className="text-2xl font-extrabold text-blue-600 tabular-nums">
            {stats.todayCount} / {stats.dailyGoal}
          </div>
          <div className="w-full h-2 bg-blue-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-600 to-sky-400 rounded-full transition-all"
              style={{ width: `${goalPct}%` }}
            />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-1 shadow-2xs">
          <div className="text-xs font-semibold text-slate-500">Cần ôn ngay</div>
          <div className="text-2xl font-extrabold text-blue-600 tabular-nums">
            {dist.due}
          </div>
          <div className="text-xs text-slate-500">Từ đã đến hạn luyện lại</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-1 shadow-2xs">
          <div className="text-xs font-semibold text-slate-500">Tổng số từ vựng</div>
          <div className="text-2xl font-extrabold text-slate-900 tabular-nums">
            {cards.length}
          </div>
          <div className="text-xs text-slate-500 tabular-nums">
            {dist[6]} từ đạt Cấp 6 Nhớ sâu ({dist.archived} đã tắt ôn)
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-1 shadow-2xs">
          <div className="text-xs font-semibold text-slate-500">Chuỗi ngày học</div>
          <div className="text-2xl font-extrabold text-amber-600 tabular-nums flex items-center gap-1.5">
            {stats.streak}
            <Flame className="w-6 h-6 text-orange-500 fill-amber-400" />
          </div>
          <div className="text-xs text-slate-500">Duy trì mỗi ngày để nhớ lâu</div>
        </div>
      </div>

      {/* 6-Level Memory Distribution Strip */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-blue-600" />
            <h3 className="text-base font-extrabold text-slate-900">
              Phân bổ 6 cấp độ nhớ sâu
            </h3>
          </div>
          <button
            type="button"
            onClick={onGoToSrs}
            className="text-xs font-bold text-blue-600 hover:text-blue-800 cursor-pointer"
          >
            Mở Ôn tập & Game →
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {SRS_LEVEL_SPECS.map((spec) => (
            <button
              key={spec.level}
              type="button"
              onClick={onGoToSrs}
              className="flex items-center gap-3 p-3 rounded-xl border border-slate-200/80 hover:border-blue-400 bg-slate-50/50 hover:bg-blue-50/40 transition-colors text-left cursor-pointer"
            >
              <LevelRing level={spec.level} size={34} />
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-800 truncate">{spec.label}</div>
                <div className="text-[11px] text-slate-500">{spec.intervalLabel}</div>
                <div className="text-xs font-extrabold text-blue-700 tabular-nums mt-0.5">
                  {dist[spec.level]} từ
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Decks Grid */}
      <div className="space-y-3">
        <h3 className="text-lg font-extrabold text-slate-900">Các bộ thẻ từ vựng</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {decks.map((deck) => {
            const deckCards = cards.filter((c) => c.deckId === deck.id);
            const dueCount = deckCards.filter((c) => isCardDue(c)).length;
            const deepCount = deckCards.filter((c) => c.srs.level === 6).length;
            return (
              <div
                key={deck.id}
                className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-3.5 hover:border-blue-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="text-base font-extrabold text-slate-900 truncate">
                      {deck.name}
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                      {deck.desc || 'Bộ từ vựng cá nhân'}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-bold tabular-nums shrink-0 ${
                      dueCount > 0 ? 'text-blue-600' : 'text-emerald-600'
                    }`}
                  >
                    {dueCount > 0 ? `${dueCount} cần ôn` : 'Đã xong'}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-600 tabular-nums">
                  <span>
                    <strong className="text-slate-900">{deckCards.length}</strong> thẻ
                  </span>
                  <span className="text-slate-300">·</span>
                  <span>
                    <strong className="text-blue-700">{deepCount}</strong> nhớ sâu
                  </span>
                  <span className="text-slate-300">·</span>
                  <span>
                    <strong className="text-slate-900">
                      {deckCards.filter((c) => c.image).length}
                    </strong>{' '}
                    có ảnh
                  </span>
                </div>

                <div className="flex items-center gap-2 pt-3 border-t border-slate-100 mt-auto flex-wrap">
                  <button
                    type="button"
                    onClick={() => onStartSrsForDeck(deck.id)}
                    className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer"
                  >
                    Ôn tổng hợp
                  </button>
                  <button
                    type="button"
                    onClick={() => onStartGamesForDeck(deck.id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 hover:border-blue-400 text-slate-700 text-xs font-bold cursor-pointer"
                  >
                    <Gamepad2 className="w-3.5 h-3.5" />
                    Game
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenAddWord(deck.id)}
                    className="px-2.5 py-1.5 rounded-xl text-slate-600 hover:bg-slate-100 text-xs font-semibold cursor-pointer"
                  >
                    + Từ
                  </button>
                  <button
                    type="button"
                    aria-label={`Xóa bộ thẻ ${deck.name}`}
                    onClick={() => onDeleteDeck(deck.id)}
                    className="ml-auto p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
