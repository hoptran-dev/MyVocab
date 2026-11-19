import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  CheckSquare,
  CloudRain,
  Headphones,
  Keyboard,
  Lightbulb,
  List,
  RotateCcw,
  Shuffle,
  SlidersHorizontal,
  Turtle,
  Type as TypeIcon,
  Volume2,
} from 'lucide-react';
import type {
  AppSettings,
  GameModeId,
  MatchHistoryItem,
  MemoryLevel,
  MixedExerciseType,
  VocabCard,
} from '../types/vocab';
import { DEFAULT_MIXED_MODES, pickMixedQuestionType } from '../utils/srs';
import { speakWord } from '../utils/speech';
import { LevelRing } from './LevelRing';
import { Level6ConfigModal } from './Level6ConfigModal';

interface GameStageProps {
  mode: GameModeId;
  cards: VocabCard[];
  allCards: VocabCard[];
  deckName: string;
  settings: AppSettings;
  mixedModes: MixedExerciseType[];
  onUpdateMixedModes: (modes: MixedExerciseType[]) => void;
  onBack: () => void;
  onReplay: () => void;
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

const MODE_LABELS: Record<GameModeId, string> = {
  mixed: 'Ôn từ vựng tổng hợp',
  flashcard: 'Flashcard',
  quiz: 'Trắc Nghiệm (Có ảnh)',
  matching: 'Nối Từ (Matching)',
  typing: 'Điền từ (Anh & Việt)',
  dictation: 'Nghe & Viết lại',
  rain: 'Mưa Từ Vựng',
  speed: 'Luyện Gõ Tốc Độ',
  special: 'Đặc biệt',
};

export function GameStage({
  mode,
  cards,
  allCards,
  deckName,
  settings,
  mixedModes,
  onUpdateMixedModes,
  onBack,
  onReplay,
  onReviewCardInGame,
  onConfigureLevel6,
  onCompleteGame,
  onOpenAddWord,
}: GameStageProps) {
  const [specialSubMode, setSpecialSubMode] = useState<'mix' | 'rain' | 'speed'>('mix');
  const [level6Queue, setLevel6Queue] = useState<VocabCard[]>([]);
  const [levelEvent, setLevelEvent] = useState<{
    word: string;
    from: MemoryLevel;
    to: MemoryLevel;
    ok: boolean;
  } | null>(null);
  const levelEventTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCardResult = useCallback(
    (cardId: string, correct: boolean) => {
      const result = onReviewCardInGame(cardId, correct);
      if (result.updatedCard) {
        const prevLvl = result.previousLevel ?? 0;
        const nextLvl = result.updatedCard.srs.level;
        setLevelEvent({
          word: result.updatedCard.word,
          from: prevLvl,
          to: nextLvl,
          ok: correct,
        });
        if (levelEventTimer.current) clearTimeout(levelEventTimer.current);
        levelEventTimer.current = setTimeout(() => setLevelEvent(null), 3200);
      }
      if (result.justReachedLevel6 && result.updatedCard) {
        setLevel6Queue((prev) =>
          prev.some((c) => c.id === result.updatedCard!.id)
            ? prev
            : [...prev, result.updatedCard!]
        );
      }
    },
    [onReviewCardInGame]
  );

  const finishAndRecord = useCallback(
    (score: number, total: number, labelOverride?: string) => {
      const safeTotal = Math.max(1, total);
      const accuracy = Math.min(100, Math.round((score / safeTotal) * 100));
      onCompleteGame({
        mode,
        modeLabel: labelOverride || MODE_LABELS[mode],
        deckName,
        score,
        total: safeTotal,
        accuracy,
        coinsEarned: 0,
      });
    },
    [deckName, mode, onCompleteGame]
  );

  if (cards.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-4">
        <h3 className="text-lg font-extrabold text-slate-900">
          Không có từ vựng nào khớp với bộ lọc hiện tại!
        </h3>
        <p className="text-sm text-slate-500">
          Hãy đổi Bộ lọc sang &ldquo;Tất cả từ&rdquo; hoặc thêm từ vựng mới vào kho.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-semibold text-sm hover:bg-slate-50 cursor-pointer"
          >
            Quay lại chọn bộ lọc
          </button>
          <button
            type="button"
            onClick={onOpenAddWord}
            className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 cursor-pointer"
          >
            + Thêm từ mới
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top Bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Đổi dạng bài
        </button>

        <div className="flex items-center gap-3 text-sm flex-wrap">
          {levelEvent && (
            <span
              data-testid="live-level-delta"
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold border ${
                levelEvent.ok
                  ? levelEvent.to === 6
                    ? 'bg-blue-50 border-blue-300 text-blue-700'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-rose-50 border-rose-200 text-rose-700'
              }`}
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              {levelEvent.ok
                ? levelEvent.to === 6
                  ? `${levelEvent.word}: Đạt Cấp 6 — Nhớ sâu!`
                  : `${levelEvent.word}: Cấp ${levelEvent.from} → Cấp ${levelEvent.to}`
                : `${levelEvent.word}: Về Cấp 1 để nhớ kỹ hơn`}
            </span>
          )}
          <span className="font-extrabold text-slate-900">{MODE_LABELS[mode]}</span>
          <span className="text-slate-300">·</span>
          <span className="text-slate-500 font-medium">{deckName}</span>
        </div>
      </div>

      {/* Special mode sub-selector */}
      {mode === 'special' && (
        <div className="flex items-center gap-2 p-1.5 bg-white border border-slate-200 rounded-xl w-fit">
          {[
            { id: 'mix' as const, label: 'Thử thách hỗn hợp', icon: Shuffle },
            { id: 'rain' as const, label: 'Mưa từ vựng', icon: CloudRain },
            { id: 'speed' as const, label: 'Gõ tốc độ', icon: Keyboard },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = specialSubMode === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSpecialSubMode(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  active
                    ? 'bg-pink-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Active Stage */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm">
        {mode === 'mixed' && (
          <MixedReviewGame
            cards={cards}
            allCards={allCards}
            settings={settings}
            enabledModes={mixedModes}
            onUpdateEnabledModes={onUpdateMixedModes}
            onCardResult={handleCardResult}
            onFinish={(s, t) => finishAndRecord(s, t, 'Ôn từ vựng tổng hợp')}
            onReplay={onReplay}
            onBack={onBack}
          />
        )}
        {mode === 'flashcard' && (
          <FlashcardGame
            cards={cards}
            settings={settings}
            onCardResult={handleCardResult}
            onFinish={(s, t) => finishAndRecord(s, t)}
            onReplay={onReplay}
            onBack={onBack}
          />
        )}
        {mode === 'quiz' && (
          <QuizGame
            cards={cards}
            allCards={allCards}
            settings={settings}
            onCardResult={handleCardResult}
            onFinish={(s, t) => finishAndRecord(s, t)}
            onReplay={onReplay}
            onBack={onBack}
          />
        )}
        {mode === 'matching' && (
          <MatchingGame
            cards={cards}
            settings={settings}
            onCardResult={handleCardResult}
            onFinish={(s, t) => finishAndRecord(s, t)}
            onReplay={onReplay}
            onBack={onBack}
          />
        )}
        {mode === 'typing' && (
          <TypingFillGame
            cards={cards}
            settings={settings}
            onCardResult={handleCardResult}
            onFinish={(s, t) => finishAndRecord(s, t)}
            onReplay={onReplay}
            onBack={onBack}
          />
        )}
        {mode === 'dictation' && (
          <DictationGame
            cards={cards}
            settings={settings}
            onCardResult={handleCardResult}
            onFinish={(s, t) => finishAndRecord(s, t)}
            onReplay={onReplay}
            onBack={onBack}
          />
        )}
        {(mode === 'rain' || mode === 'speed') && (
          <FallingWordsGame
            key={mode}
            cards={cards}
            variant={mode}
            settings={settings}
            onCardResult={handleCardResult}
            onFinish={(s, t) => finishAndRecord(s, t)}
            onBack={onBack}
          />
        )}
        {mode === 'special' && specialSubMode === 'mix' && (
          <SpecialMixGame
            cards={cards}
            allCards={allCards}
            settings={settings}
            onCardResult={handleCardResult}
            onFinish={(s, t) => finishAndRecord(s, t, 'Đặc biệt · Hỗn hợp')}
            onReplay={onReplay}
            onBack={onBack}
          />
        )}
        {mode === 'special' && (specialSubMode === 'rain' || specialSubMode === 'speed') && (
          <FallingWordsGame
            key={specialSubMode}
            cards={cards}
            variant={specialSubMode}
            settings={settings}
            onCardResult={handleCardResult}
            onFinish={(s, t) =>
              finishAndRecord(
                s,
                t,
                specialSubMode === 'rain' ? 'Đặc biệt · Mưa từ vựng' : 'Đặc biệt · Gõ tốc độ'
              )
            }
            onBack={onBack}
          />
        )}
      </div>

      {/* Level 6 graduation prompt if a card leveled up during gameplay */}
      {level6Queue.length > 0 && (
        <Level6ConfigModal
          card={level6Queue[0]}
          isGraduation
          onSave={(id, opts) => {
            onConfigureLevel6(id, opts);
            setLevel6Queue((prev) => prev.slice(1));
          }}
          onClose={() => setLevel6Queue((prev) => prev.slice(1))}
        />
      )}
    </div>
  );
}

/* ==================== 1. FLASHCARD MODE ==================== */
function FlashcardGame({
  cards,
  settings,
  onCardResult,
  onFinish,
  onReplay,
  onBack,
}: {
  cards: VocabCard[];
  settings: AppSettings;
  onCardResult: (id: string, ok: boolean) => void;
  onFinish: (score: number, total: number) => void;
  onReplay: () => void;
  onBack: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);

  const card = cards[idx];

  useEffect(() => {
    if (card && !done && !flipped) speakWord(card.word, settings);
  }, [card?.id, done, flipped, settings]);

  const answer = (ok: boolean) => {
    if (!card) return;
    onCardResult(card.id, ok);
    const nextScore = score + (ok ? 1 : 0);
    setScore(nextScore);
    if (idx + 1 >= cards.length) {
      setDone(true);
      onFinish(nextScore, cards.length);
    } else {
      setIdx((i) => i + 1);
      setFlipped(false);
    }
  };

  if (done) {
    return (
      <ResultPanel
        title="Hoàn thành phiên Flashcard!"
        score={score}
        total={cards.length}
        onReplay={() => {
          setIdx(0);
          setScore(0);
          setFlipped(false);
          setDone(false);
          onReplay();
        }}
        onBack={onBack}
      />
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <div className="flex items-center justify-between text-xs font-bold text-slate-500 tabular-nums">
        <span>Thẻ {idx + 1} / {cards.length}</span>
        <span className="text-emerald-600">Đã nhớ: {score}</span>
      </div>

      <div className="perspective-1200">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setFlipped((f) => !f)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setFlipped((f) => !f);
            }
          }}
          className={`relative w-full min-h-[300px] transform-style-3d transition-transform duration-500 cursor-pointer ${
            flipped ? 'rotate-y-180' : ''
          }`}
        >
          <div className="absolute inset-0 backface-hidden rounded-3xl border border-indigo-200 bg-gradient-to-b from-white to-indigo-50/40 p-6 flex flex-col items-center justify-center text-center">
            <div className="absolute top-4 left-4">
              <LevelRing level={card.srs.level} size={30} noReview={card.srs.noReview} />
            </div>
            <button
              type="button"
              aria-label={`Phát âm ${card.word}`}
              onClick={(e) => {
                e.stopPropagation();
                speakWord(card.word, settings);
              }}
              className="absolute top-4 right-4 p-2 rounded-full bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white cursor-pointer"
            >
              <Volume2 className="w-4 h-4" />
            </button>
            {settings.showImageHints && card.image && (
              <img
                src={card.image}
                alt={card.word}
                referrerPolicy="no-referrer"
                className="w-28 h-24 object-contain mb-3"
              />
            )}
            <div className="text-3xl font-extrabold text-slate-900">{card.word}</div>
            {card.ipa && <div className="text-sm font-mono text-indigo-600 mt-1">{card.ipa}</div>}
            <div className="text-xs text-slate-400 mt-5">Nhấn vào thẻ để lật xem nghĩa</div>
          </div>

          <div className="absolute inset-0 backface-hidden rotate-y-180 rounded-3xl border border-indigo-300 bg-white p-6 flex flex-col items-center justify-center text-center">
            <div className="text-2xl font-extrabold text-indigo-700">{card.meaning}</div>
            {card.example && (
              <p className="mt-3 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-3 max-w-md">
                {card.example}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => answer(false)}
          className="py-3.5 rounded-2xl border-2 border-rose-200 text-rose-700 font-bold text-sm hover:bg-rose-50 cursor-pointer"
        >
          Chưa nhớ
        </button>
        <button
          type="button"
          onClick={() => answer(true)}
          className="py-3.5 rounded-2xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 cursor-pointer"
        >
          Đã nhớ
        </button>
      </div>
    </div>
  );
}

/* ==================== 2. QUIZ MODE ==================== */
function QuizGame({
  cards,
  allCards,
  settings,
  onCardResult,
  onFinish,
  onReplay,
  onBack,
}: {
  cards: VocabCard[];
  allCards: VocabCard[];
  settings: AppSettings;
  onCardResult: (id: string, ok: boolean) => void;
  onFinish: (score: number, total: number) => void;
  onReplay: () => void;
  onBack: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const target = cards[idx];

  const options = useMemo(() => {
    if (!target) return [];
    const source = allCards.length >= 4 ? allCards : cards;
    const distractors = source
      .filter((c) => c.id !== target.id && c.meaning !== target.meaning)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);
    return [target, ...distractors].sort(() => Math.random() - 0.5);
  }, [target, allCards, cards]);

  useEffect(() => {
    if (target && !done) speakWord(target.word, settings);
  }, [target?.id, done, settings]);

  const pickOption = (optId: string) => {
    if (selectedId || !target) return;
    setSelectedId(optId);
    const ok = optId === target.id;
    onCardResult(target.id, ok);
    const nextScore = score + (ok ? 1 : 0);
    if (ok) setScore(nextScore);

    setTimeout(() => {
      if (idx + 1 >= cards.length) {
        setDone(true);
        onFinish(nextScore, cards.length);
      } else {
        setIdx((i) => i + 1);
        setSelectedId(null);
      }
    }, 800);
  };

  if (done || !target) {
    return (
      <ResultPanel
        title="Hoàn thành Trắc nghiệm!"
        score={score}
        total={cards.length}
        onReplay={() => {
          setIdx(0);
          setScore(0);
          setSelectedId(null);
          setDone(false);
          onReplay();
        }}
        onBack={onBack}
      />
    );
  }

  return (
    <div className="max-w-xl mx-auto text-center space-y-5">
      <div className="flex items-center justify-between text-xs font-bold text-slate-500 tabular-nums">
        <span>Câu {idx + 1} / {cards.length}</span>
        <span className="text-orange-600">Đúng: {score}</span>
      </div>

      {settings.showImageHints && target.image && (
        <div className="w-32 h-24 mx-auto rounded-2xl bg-orange-50/40 border border-orange-100 p-2 flex items-center justify-center">
          <img
            src={target.image}
            alt={target.word}
            referrerPolicy="no-referrer"
            className="w-full h-full object-contain"
          />
        </div>
      )}

      <div className="space-y-1">
        <div className="flex items-center justify-center gap-2">
          <span className="text-3xl font-extrabold text-slate-900">{target.word}</span>
          <button
            type="button"
            aria-label={`Nghe phát âm ${target.word}`}
            onClick={() => speakWord(target.word, settings)}
            className="p-2 rounded-full bg-orange-50 text-orange-600 hover:bg-orange-500 hover:text-white transition-colors cursor-pointer"
          >
            <Volume2 className="w-4 h-4" />
          </button>
        </div>
        {target.ipa && <div className="text-sm font-mono text-slate-500">{target.ipa}</div>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
        {options.map((opt) => {
          const isPicked = selectedId === opt.id;
          const isCorrect = opt.id === target.id;
          let cls =
            'border-slate-200 bg-white text-slate-800 hover:border-orange-400 hover:bg-orange-50/40';
          if (selectedId) {
            if (isCorrect) cls = 'border-emerald-500 bg-emerald-50 text-emerald-800';
            else if (isPicked) cls = 'border-rose-500 bg-rose-50 text-rose-700 animate-shake';
            else cls = 'border-slate-200 bg-slate-50 text-slate-400';
          }
          return (
            <button
              key={opt.id}
              type="button"
              disabled={Boolean(selectedId)}
              onClick={() => pickOption(opt.id)}
              className={`p-4 rounded-2xl border-2 text-sm font-bold transition-all cursor-pointer ${cls}`}
            >
              {opt.meaning}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ==================== 3. MATCHING MODE ==================== */
interface MatchTile {
  key: string;
  cardId: string;
  side: 'en' | 'vi';
  text: string;
}

function MatchingGame({
  cards,
  settings,
  onCardResult,
  onFinish,
  onReplay,
  onBack,
}: {
  cards: VocabCard[];
  settings: AppSettings;
  onCardResult: (id: string, ok: boolean) => void;
  onFinish: (score: number, total: number) => void;
  onReplay: () => void;
  onBack: () => void;
}) {
  const roundSize = Math.min(6, cards.length);
  const [timeLeft, setTimeLeft] = useState(45);
  const [matchedPairs, setMatchedPairs] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [combo, setCombo] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [matchedIds, setMatchedIds] = useState<Set<string>>(new Set());
  const [wrongKeys, setWrongKeys] = useState<string[]>([]);
  const [roundIdx, setRoundIdx] = useState(0);
  const [done, setDone] = useState(false);

  const tiles: MatchTile[] = useMemo(() => {
    const start = (roundIdx * roundSize) % cards.length;
    const batch: VocabCard[] = [];
    for (let i = 0; i < roundSize; i++) {
      batch.push(cards[(start + i) % cards.length]);
    }
    const list: MatchTile[] = [];
    batch.forEach((c) => {
      list.push({ key: `${c.id}_en`, cardId: c.id, side: 'en', text: c.word });
      list.push({ key: `${c.id}_vi`, cardId: c.id, side: 'vi', text: c.meaning });
    });
    return list.sort(() => Math.random() - 0.5);
  }, [cards, roundIdx, roundSize]);

  const finishedRef = useRef(false);
  useEffect(() => {
    if (done) return;
    const id = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(id);
          if (!finishedRef.current) {
            finishedRef.current = true;
            setDone(true);
            onFinish(matchedPairs, Math.max(1, matchedPairs + mistakes));
          }
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [done, matchedPairs, mistakes, onFinish]);

  const clickTile = (tile: MatchTile) => {
    if (done || matchedIds.has(tile.cardId)) return;
    if (tile.side === 'en') speakWord(tile.text, settings);

    if (!selectedKey) {
      setSelectedKey(tile.key);
      return;
    }
    if (selectedKey === tile.key) {
      setSelectedKey(null);
      return;
    }

    const first = tiles.find((t) => t.key === selectedKey);
    setSelectedKey(null);
    if (!first) return;

    if (first.cardId === tile.cardId && first.side !== tile.side) {
      const nextSet = new Set(matchedIds);
      nextSet.add(tile.cardId);
      setMatchedIds(nextSet);
      setMatchedPairs((p) => p + 1);
      setCombo((c) => c + 1);
      setTimeLeft((t) => t + 2);
      onCardResult(tile.cardId, true);

      if (nextSet.size >= roundSize) {
        setTimeout(() => {
          setMatchedIds(new Set());
          setRoundIdx((r) => r + 1);
        }, 280);
      }
    } else {
      setCombo(0);
      setMistakes((m) => m + 1);
      setTimeLeft((t) => Math.max(1, t - 2));
      setWrongKeys([first.key, tile.key]);
      setTimeout(() => setWrongKeys([]), 320);
    }
  };

  if (done) {
    return (
      <ResultPanel
        title="Hết giờ Nối từ!"
        score={matchedPairs}
        total={Math.max(1, matchedPairs + mistakes)}
        subtitle={`Bạn đã ghép chính xác ${matchedPairs} cặp từ vựng!`}
        onReplay={() => {
          finishedRef.current = false;
          setTimeLeft(45);
          setMatchedPairs(0);
          setMistakes(0);
          setCombo(0);
          setMatchedIds(new Set());
          setRoundIdx(0);
          setDone(false);
          onReplay();
        }}
        onBack={onBack}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2 text-sm font-bold tabular-nums">
        <div className="flex items-center gap-4">
          <span className="text-sky-700">Thời gian: {timeLeft}s</span>
          <span className="text-emerald-700">Đã nối: {matchedPairs} cặp</span>
          <span className="text-amber-600">Combo: x{combo}</span>
        </div>
        <button
          type="button"
          onClick={() => {
            finishedRef.current = true;
            setDone(true);
            onFinish(matchedPairs, Math.max(1, matchedPairs + mistakes));
          }}
          className="text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
        >
          Kết thúc sớm
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {tiles.map((tile) => {
          const isMatched = matchedIds.has(tile.cardId);
          const isSelected = selectedKey === tile.key;
          const isWrong = wrongKeys.includes(tile.key);

          return (
            <button
              key={tile.key}
              type="button"
              disabled={isMatched}
              onClick={() => clickTile(tile)}
              className={`min-h-[82px] p-3.5 rounded-2xl border-2 text-sm font-bold transition-all cursor-pointer ${
                isMatched
                  ? 'opacity-0 pointer-events-none scale-90'
                  : isWrong
                    ? 'border-rose-500 bg-rose-50 text-rose-700 animate-shake'
                    : isSelected
                      ? 'border-sky-600 bg-sky-600 text-white shadow-md'
                      : tile.side === 'en'
                        ? 'border-sky-200 bg-white text-sky-700 hover:border-sky-500'
                        : 'border-slate-200 bg-slate-50/70 text-slate-800 hover:border-sky-400'
              }`}
            >
              {tile.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ==================== 4. TYPING / FILL GAME ==================== */
function TypingFillGame({
  cards,
  settings,
  onCardResult,
  onFinish,
  onReplay,
  onBack,
}: {
  cards: VocabCard[];
  settings: AppSettings;
  onCardResult: (id: string, ok: boolean) => void;
  onFinish: (score: number, total: number) => void;
  onReplay: () => void;
  onBack: () => void;
}) {
  const [dir, setDir] = useState<'vi2en' | 'en2vi'>('vi2en');
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState('');
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);

  const card = cards[idx];
  const isEnTarget = dir === 'vi2en';

  const checkOrNext = () => {
    if (!card) return;
    if (feedback) {
      if (idx + 1 >= cards.length) {
        setDone(true);
        onFinish(score, cards.length);
      } else {
        setIdx((i) => i + 1);
        setInput('');
        setFeedback(null);
      }
      return;
    }

    const val = input.trim().toLowerCase();
    if (!val) return;
    const expected = (isEnTarget ? card.word : card.meaning).trim().toLowerCase();
    let ok = false;
    if (isEnTarget) {
      ok = val === expected;
    } else {
      const parts = expected.split(/[,;/]+/).map((s) => s.trim()).filter(Boolean);
      ok = val === expected || parts.some((p) => p === val || (val.length >= 2 && p.includes(val)));
    }
    onCardResult(card.id, ok);
    if (ok) setScore((s) => s + 1);
    speakWord(card.word, settings);
    setFeedback({
      ok,
      text: ok
        ? `Chính xác! ${card.word} — ${card.meaning}`
        : `Đáp án đúng: ${isEnTarget ? card.word : card.meaning}`,
    });
  };

  if (done || !card) {
    return (
      <ResultPanel
        title="Hoàn thành Gõ từ vựng!"
        score={score}
        total={cards.length}
        onReplay={() => {
          setIdx(0);
          setInput('');
          setFeedback(null);
          setScore(0);
          setDone(false);
          onReplay();
        }}
        onBack={onBack}
      />
    );
  }

  return (
    <div className="max-w-xl mx-auto text-center space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-xs font-bold text-slate-500 tabular-nums">
          Câu {idx + 1} / {cards.length} · Đúng: {score}
        </span>
        <select
          aria-label="Chiều gõ từ"
          value={dir}
          onChange={(e) => {
            setDir(e.target.value as 'vi2en' | 'en2vi');
            setInput('');
            setFeedback(null);
          }}
          className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700"
        >
          <option value="vi2en">Nhìn Việt → Gõ tiếng Anh</option>
          <option value="en2vi">Nhìn Anh → Gõ tiếng Việt</option>
        </select>
      </div>

      {settings.showImageHints && card.image && (
        <div className="w-32 h-24 mx-auto rounded-2xl bg-emerald-50/40 border border-emerald-100 p-2 flex items-center justify-center">
          <img
            src={card.image}
            alt={card.word}
            referrerPolicy="no-referrer"
            className="w-full h-full object-contain"
          />
        </div>
      )}

      <div>
        <div className="text-xs font-medium text-slate-500">
          {isEnTarget ? 'Gõ từ tiếng Anh tương ứng:' : 'Gõ nghĩa tiếng Việt của từ:'}
        </div>
        <div className="text-2xl font-extrabold text-slate-900 mt-1">
          {isEnTarget ? card.meaning : card.word}
        </div>
      </div>

      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            checkOrNext();
          }
        }}
        placeholder={isEnTarget ? 'Nhập từ tiếng Anh...' : 'Nhập nghĩa tiếng Việt...'}
        autoFocus
        className="w-full max-w-md mx-auto block px-4 py-3 text-center text-lg font-bold border-2 border-slate-200 focus:border-emerald-600 rounded-2xl focus:outline-none"
      />

      {feedback && (
        <div
          className={`p-3 rounded-xl text-sm font-semibold ${
            feedback.ok
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-700 border border-rose-200'
          }`}
        >
          {feedback.text}
        </div>
      )}

      <div className="flex items-center justify-center gap-3 pt-1">
        <button
          type="button"
          onClick={checkOrNext}
          className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm cursor-pointer"
        >
          {feedback ? 'Câu tiếp theo (Enter)' : 'Kiểm tra (Enter)'}
        </button>
        {!feedback && (
          <button
            type="button"
            onClick={() => {
              onCardResult(card.id, false);
              setFeedback({
                ok: false,
                text: `Đáp án đúng: ${isEnTarget ? card.word : card.meaning}`,
              });
            }}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 cursor-pointer"
          >
            Xem đáp án
          </button>
        )}
      </div>
    </div>
  );
}

/* ==================== 5. DICTATION MODE ==================== */
function DictationGame({
  cards,
  settings,
  onCardResult,
  onFinish,
  onReplay,
  onBack,
}: {
  cards: VocabCard[];
  settings: AppSettings;
  onCardResult: (id: string, ok: boolean) => void;
  onFinish: (score: number, total: number) => void;
  onReplay: () => void;
  onBack: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);

  const card = cards[idx];

  useEffect(() => {
    if (card && !done) {
      const t = setTimeout(() => speakWord(card.word, settings), 160);
      return () => clearTimeout(t);
    }
  }, [card?.id, done, settings]);

  const checkOrNext = () => {
    if (!card) return;
    if (feedback) {
      if (idx + 1 >= cards.length) {
        setDone(true);
        onFinish(score, cards.length);
      } else {
        setIdx((i) => i + 1);
        setInput('');
        setShowHint(false);
        setFeedback(null);
      }
      return;
    }

    const val = input.trim();
    if (!val) return;
    const ok = val.toLowerCase() === card.word.trim().toLowerCase();
    onCardResult(card.id, ok);
    if (ok) setScore((s) => s + 1);
    setFeedback({
      ok,
      text: ok
        ? `Chính xác! ${card.word} ${card.ipa} — ${card.meaning}`
        : `Bạn viết "${val}" → Đáp án: ${card.word} (${card.meaning})`,
    });
  };

  if (done || !card) {
    return (
      <ResultPanel
        title="Hoàn thành bài Nghe viết!"
        score={score}
        total={cards.length}
        onReplay={() => {
          setIdx(0);
          setInput('');
          setShowHint(false);
          setFeedback(null);
          setScore(0);
          setDone(false);
          onReplay();
        }}
        onBack={onBack}
      />
    );
  }

  return (
    <div className="max-w-xl mx-auto text-center space-y-4">
      <div className="flex items-center justify-between text-xs font-bold text-slate-500 tabular-nums">
        <span>Từ {idx + 1} / {cards.length}</span>
        <span className="text-cyan-700">Chính xác: {score}</span>
      </div>

      {settings.showImageHints && card.image && (
        <div className="w-32 h-24 mx-auto rounded-2xl bg-cyan-50/40 border border-cyan-100 p-2 flex items-center justify-center">
          <img
            src={card.image}
            alt="Hình gợi ý"
            referrerPolicy="no-referrer"
            className="w-full h-full object-contain"
          />
        </div>
      )}

      <div className="flex items-center justify-center gap-2.5 flex-wrap">
        <button
          type="button"
          onClick={() => speakWord(card.word, settings)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-sm cursor-pointer"
        >
          <Volume2 className="w-4 h-4" />
          Nghe phát âm
        </button>
        <button
          type="button"
          onClick={() => speakWord(card.word, settings, 0.65)}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50 cursor-pointer"
        >
          <Turtle className="w-4 h-4" />
          Đọc chậm
        </button>
        <button
          type="button"
          onClick={() => setShowHint(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-amber-700 bg-amber-50 font-semibold text-sm hover:bg-amber-100 cursor-pointer"
        >
          <Lightbulb className="w-4 h-4" />
          Gợi ý
        </button>
      </div>

      {showHint && (
        <div className="text-xs font-semibold text-slate-600">
          Gợi ý: Bắt đầu bằng <strong className="font-mono text-cyan-700">{card.word[0]}...</strong> ({card.word.length} ký tự) · Nghĩa: <strong>{card.meaning}</strong>
        </div>
      )}

      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            checkOrNext();
          }
        }}
        placeholder="Nghe và gõ lại chính xác từ tiếng Anh..."
        autoFocus
        className="w-full max-w-md mx-auto block px-4 py-3 text-center text-lg font-bold border-2 border-slate-200 focus:border-cyan-600 rounded-2xl focus:outline-none"
      />

      {feedback && (
        <div
          className={`p-3 rounded-xl text-sm font-semibold ${
            feedback.ok
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-700 border border-rose-200'
          }`}
        >
          {feedback.text}
        </div>
      )}

      <button
        type="button"
        onClick={checkOrNext}
        className="px-6 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-sm cursor-pointer"
      >
        {feedback ? 'Từ tiếp theo (Enter)' : 'Kiểm tra (Enter)'}
      </button>
    </div>
  );
}

/* ==================== 6A. SPECIAL MIX MODE ==================== */
function SpecialMixGame({
  cards,
  allCards,
  settings,
  onCardResult,
  onFinish,
  onReplay,
  onBack,
}: {
  cards: VocabCard[];
  allCards: VocabCard[];
  settings: AppSettings;
  onCardResult: (id: string, ok: boolean) => void;
  onFinish: (score: number, total: number) => void;
  onReplay: () => void;
  onBack: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [input, setInput] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [done, setDone] = useState(false);

  const card = cards[idx];
  const roundType: 'quiz' | 'type' | 'listen' =
    idx % 3 === 0 ? 'quiz' : idx % 3 === 1 ? 'type' : 'listen';

  const options = useMemo(() => {
    if (!card) return [];
    const source = allCards.length >= 4 ? allCards : cards;
    const distractors = source
      .filter((c) => c.id !== card.id)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);
    return [card, ...distractors].sort(() => Math.random() - 0.5);
  }, [card, allCards, cards]);

  useEffect(() => {
    if (card && !done && (roundType === 'listen' || roundType === 'quiz')) {
      speakWord(card.word, settings);
    }
  }, [card?.id, done, roundType, settings]);

  const nextStep = (updatedScore: number) => {
    if (idx + 1 >= cards.length) {
      setDone(true);
      onFinish(updatedScore, cards.length);
    } else {
      setIdx((i) => i + 1);
      setInput('');
      setPicked(null);
      setFeedback(null);
    }
  };

  if (done || !card) {
    return (
      <ResultPanel
        title="Hoàn thành Thử thách Hỗn hợp!"
        score={score}
        total={cards.length}
        onReplay={() => {
          setIdx(0);
          setScore(0);
          setInput('');
          setPicked(null);
          setFeedback(null);
          setDone(false);
          onReplay();
        }}
        onBack={onBack}
      />
    );
  }

  return (
    <div className="max-w-xl mx-auto text-center space-y-5">
      <div className="flex items-center justify-between text-xs font-bold text-slate-500 tabular-nums">
        <span>
          Câu {idx + 1} / {cards.length} ·{' '}
          <strong className="text-pink-600">
            {roundType === 'quiz' ? 'Trắc nghiệm' : roundType === 'type' ? 'Dịch & Gõ từ' : 'Nghe chép'}
          </strong>
        </span>
        <span className="text-pink-600">Điểm: {score}</span>
      </div>

      {roundType === 'quiz' ? (
        <>
          <div className="text-3xl font-extrabold text-slate-900">{card.word}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {options.map((opt) => (
              <button
                key={opt.id}
                type="button"
                disabled={Boolean(picked)}
                onClick={() => {
                  setPicked(opt.id);
                  const ok = opt.id === card.id;
                  onCardResult(card.id, ok);
                  const nextS = score + (ok ? 1 : 0);
                  if (ok) setScore(nextS);
                  setTimeout(() => nextStep(nextS), 700);
                }}
                className={`p-4 rounded-2xl border-2 text-sm font-bold cursor-pointer ${
                  picked
                    ? opt.id === card.id
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                      : picked === opt.id
                        ? 'border-rose-500 bg-rose-50 text-rose-700'
                        : 'border-slate-200 text-slate-400'
                    : 'border-slate-200 hover:border-pink-400 hover:bg-pink-50/40'
                }`}
              >
                {opt.meaning}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          {roundType === 'listen' ? (
            <button
              type="button"
              onClick={() => speakWord(card.word, settings)}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-pink-600 text-white font-bold text-sm hover:bg-pink-700 cursor-pointer"
            >
              <Volume2 className="w-5 h-5" />
              Nghe và gõ từ tiếng Anh
            </button>
          ) : (
            <div>
              <div className="text-xs text-slate-500">Gõ từ tiếng Anh có nghĩa là:</div>
              <div className="text-2xl font-extrabold text-slate-900 mt-1">{card.meaning}</div>
            </div>
          )}

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (feedback) {
                  nextStep(score);
                } else if (input.trim()) {
                  const ok = input.trim().toLowerCase() === card.word.trim().toLowerCase();
                  onCardResult(card.id, ok);
                  if (ok) setScore((s) => s + 1);
                  speakWord(card.word, settings);
                  setFeedback({
                    ok,
                    text: ok ? `Chính xác! ${card.word}` : `Đáp án đúng: ${card.word} (${card.meaning})`,
                  });
                }
              }
            }}
            placeholder="Nhập từ tiếng Anh..."
            autoFocus
            className="w-full max-w-md mx-auto block px-4 py-3 text-center text-lg font-bold border-2 border-slate-200 focus:border-pink-500 rounded-2xl focus:outline-none"
          />

          {feedback && (
            <div
              className={`p-3 rounded-xl text-sm font-semibold ${
                feedback.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'
              }`}
            >
              {feedback.text}
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              if (feedback) {
                nextStep(score);
              } else if (input.trim()) {
                const ok = input.trim().toLowerCase() === card.word.trim().toLowerCase();
                onCardResult(card.id, ok);
                if (ok) setScore((s) => s + 1);
                speakWord(card.word, settings);
                setFeedback({
                  ok,
                  text: ok ? `Chính xác! ${card.word}` : `Đáp án đúng: ${card.word} (${card.meaning})`,
                });
              }
            }}
            className="px-6 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-700 text-white font-bold text-sm cursor-pointer"
          >
            {feedback ? 'Tiếp tục (Enter)' : 'Kiểm tra (Enter)'}
          </button>
        </>
      )}
    </div>
  );
}

/* ==================== 6B. FALLING RAIN / SPEED TYPING ==================== */
interface FallingDrop {
  uid: string;
  card: VocabCard;
  clean: string;
  typed: number;
  xPct: number;
  y: number;
  speed: number;
}

function FallingWordsGame({
  cards,
  variant,
  settings,
  onCardResult,
  onFinish,
  onBack,
}: {
  cards: VocabCard[];
  variant: 'rain' | 'speed';
  settings: AppSettings;
  onCardResult: (id: string, ok: boolean) => void;
  onFinish: (score: number, total: number) => void;
  onBack: () => void;
}) {
  const validPool = useMemo(
    () => cards.filter((c) => c.word.replace(/[^a-zA-Z0-9]/g, '').length > 0),
    [cards]
  );

  const [drops, setDrops] = useState<FallingDrop[]>([]);
  const [lockedId, setLockedId] = useState<string | null>(null);
  const [lives, setLives] = useState(3);
  const [cleared, setCleared] = useState(0);
  const [missed, setMissed] = useState(0);
  const [over, setOver] = useState(false);

  const stateRef = useRef({
    drops: [] as FallingDrop[],
    lockedId: null as string | null,
    lives: 3,
    cleared: 0,
    missed: 0,
    over: false,
    cooldown: 0.4,
  });

  useEffect(() => {
    if (!validPool.length) return;
    let rafId = 0;
    let last = performance.now();

    const step = (now: number) => {
      const st = stateRef.current;
      if (st.over) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;

      st.cooldown -= dt;
      if (st.cooldown <= 0 && st.drops.length < 4) {
        const card = validPool[Math.floor(Math.random() * validPool.length)];
        const clean = card.word.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        st.drops.push({
          uid: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          card,
          clean,
          typed: 0,
          xPct: 18 + Math.random() * 64,
          y: -40,
          speed: (variant === 'rain' ? 28 : 36) + Math.floor(st.cleared / 5) * 6,
        });
        st.cooldown = variant === 'rain' ? 2.8 : 2.1;
      }

      const surviving: FallingDrop[] = [];
      for (const d of st.drops) {
        d.y += d.speed * dt;
        if (d.y >= 330) {
          st.lives -= 1;
          st.missed += 1;
          if (st.lockedId === d.uid) st.lockedId = null;
          speakWord(d.card.word, settings);
        } else {
          surviving.push(d);
        }
      }
      st.drops = surviving;

      if (st.lives <= 0) {
        st.over = true;
        setLives(0);
        setMissed(st.missed);
        setOver(true);
        onFinish(st.cleared, Math.max(1, st.cleared + st.missed));
        return;
      }

      setDrops([...st.drops]);
      setLives(st.lives);
      setLockedId(st.lockedId);
      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [validPool, variant, settings, onFinish]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const st = stateRef.current;
      if (st.over) return;
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

      if (e.key === 'Backspace' && st.lockedId) {
        e.preventDefault();
        const found = st.drops.find((d) => d.uid === st.lockedId);
        if (found) found.typed = 0;
        st.lockedId = null;
        setLockedId(null);
        setDrops([...st.drops]);
        return;
      }

      if (e.key.length !== 1 || !/[a-zA-Z0-9]/.test(e.key)) return;
      const ch = e.key.toLowerCase();

      let locked = st.drops.find((d) => d.uid === st.lockedId);
      if (!locked) {
        const candidates = st.drops
          .filter((d) => d.clean[0] === ch)
          .sort((a, b) => b.y - a.y);
        if (candidates.length > 0) {
          locked = candidates[0];
          st.lockedId = locked.uid;
          locked.typed = 1;
        }
      } else if (locked.clean[locked.typed] === ch) {
        locked.typed += 1;
      }

      if (locked && locked.typed >= locked.clean.length) {
        st.cleared += 1;
        speakWord(locked.card.word, settings);
        onCardResult(locked.card.id, true);
        st.drops = st.drops.filter((d) => d.uid !== locked!.uid);
        st.lockedId = null;
        setCleared(st.cleared);
      }

      setLockedId(st.lockedId);
      setDrops([...st.drops]);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCardResult, settings]);

  if (over) {
    return (
      <ResultPanel
        title={variant === 'rain' ? 'Kết thúc Mưa từ vựng!' : 'Kết thúc Luyện gõ tốc độ!'}
        score={cleared}
        total={Math.max(1, cleared + missed)}
        subtitle={`Bạn đã gõ hạ thành công ${cleared} từ vựng!`}
        onReplay={() => {
          stateRef.current = {
            drops: [],
            lockedId: null,
            lives: 3,
            cleared: 0,
            missed: 0,
            over: false,
            cooldown: 0.4,
          };
          setDrops([]);
          setLives(3);
          setCleared(0);
          setMissed(0);
          setOver(false);
        }}
        onBack={onBack}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2 text-sm font-bold tabular-nums">
        <div className="flex items-center gap-4">
          <span className="text-rose-600">Mạng: {'❤'.repeat(Math.max(0, lives))}</span>
          <span className="text-blue-600">Đã bắn hạ: {cleared}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-slate-500">
            Gõ trực tiếp trên bàn phím · <kbd className="px-1.5 py-0.5 rounded bg-slate-100 font-mono">Backspace</kbd> bỏ khóa
          </span>
          <button
            type="button"
            onClick={() => {
              stateRef.current.over = true;
              setOver(true);
              onFinish(stateRef.current.cleared, Math.max(1, stateRef.current.cleared + stateRef.current.missed));
            }}
            className="text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
          >
            Kết thúc sớm
          </button>
        </div>
      </div>

      <div className="relative h-[380px] rounded-2xl border border-blue-200 bg-gradient-to-b from-blue-50 via-white to-indigo-100/70 overflow-hidden">
        {drops.map((d) => {
          const isLocked = lockedId === d.uid;
          const revealHint = d.y > 220 ? 2 : d.y > 150 ? 1 : 0;
          let alphaIdx = 0;
          const renderedChars = [...d.card.word].map((ch, i) => {
            if (/[a-zA-Z0-9]/.test(ch)) {
              const cur = alphaIdx++;
              if (variant === 'rain') {
                if (cur < d.typed) {
                  return (
                    <span key={i} className="text-blue-600">
                      {ch}
                    </span>
                  );
                }
                if (cur < revealHint) {
                  return (
                    <span key={i} className="text-sky-500">
                      {ch}
                    </span>
                  );
                }
                return <span key={i}>_</span>;
              }
              return (
                <span key={i} className={cur < d.typed ? 'text-pink-600 underline' : 'text-slate-900'}>
                  {ch}
                </span>
              );
            }
            return <span key={i}>{ch}</span>;
          });

          return (
            <div
              key={d.uid}
              style={{ left: `${d.xPct}%`, top: `${d.y}px` }}
              className={`absolute -translate-x-1/2 rounded-xl px-3.5 py-2 text-center shadow-md min-w-[140px] max-w-[230px] border-2 ${
                isLocked
                  ? 'bg-blue-50 border-blue-600 z-10'
                  : 'bg-white border-slate-200'
              }`}
            >
              {variant === 'rain' ? (
                <>
                  <div className="text-xs font-bold text-slate-800">{d.card.meaning}</div>
                  <div className="font-mono text-sm font-extrabold tracking-widest text-slate-400 mt-0.5">
                    {renderedChars}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-base font-extrabold">{renderedChars}</div>
                  <div className="text-[11px] text-slate-500">{d.card.meaning}</div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ==================== 0. UNIFIED MIXED REVIEW (DEFAULT ÔN TỪ VỰNG) ==================== */
const MIXED_MODE_OPTIONS: Array<{
  id: MixedExerciseType;
  label: string;
  icon: typeof CheckSquare;
}> = [
  { id: 'quiz', label: 'Trắc nghiệm', icon: CheckSquare },
  { id: 'dictation', label: 'Nghe viết', icon: Headphones },
  { id: 'typing', label: 'Gõ từ vựng', icon: TypeIcon },
  { id: 'flashcard', label: 'Flashcard', icon: List },
];

function MixedReviewGame({
  cards,
  allCards,
  settings,
  enabledModes,
  onUpdateEnabledModes,
  onCardResult,
  onFinish,
  onReplay,
  onBack,
}: {
  cards: VocabCard[];
  allCards: VocabCard[];
  settings: AppSettings;
  enabledModes: MixedExerciseType[];
  onUpdateEnabledModes: (modes: MixedExerciseType[]) => void;
  onCardResult: (id: string, ok: boolean) => void;
  onFinish: (score: number, total: number) => void;
  onReplay: () => void;
  onBack: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [input, setInput] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [done, setDone] = useState(false);

  const safeModes = enabledModes.length > 0 ? enabledModes : [...DEFAULT_MIXED_MODES];
  const card = cards[idx];
  const currentType = pickMixedQuestionType(idx, safeModes);

  const options = useMemo(() => {
    if (!card) return [];
    const source = allCards.length >= 4 ? allCards : cards;
    const distractors = source
      .filter((c) => c.id !== card.id && c.meaning !== card.meaning)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);
    return [card, ...distractors].sort(() => Math.random() - 0.5);
  }, [card, allCards, cards]);

  useEffect(() => {
    if (card && !done && (currentType === 'dictation' || currentType === 'quiz' || currentType === 'flashcard')) {
      const t = setTimeout(() => speakWord(card.word, settings), 140);
      return () => clearTimeout(t);
    }
  }, [card?.id, currentType, done, settings]);

  const toggleModeLive = (modeId: MixedExerciseType) => {
    const exists = safeModes.includes(modeId);
    if (exists && safeModes.length <= 1) return; // keep at least 1 active mode
    const next = exists
      ? safeModes.filter((m) => m !== modeId)
      : [...safeModes, modeId];
    onUpdateEnabledModes(next);
    // Reset unanswered transient input when user switches type mid-question
    if (!feedback && !picked) {
      setInput('');
      setFlipped(false);
      setShowHint(false);
    }
  };

  const advance = (updatedScore: number) => {
    if (idx + 1 >= cards.length) {
      setDone(true);
      onFinish(updatedScore, cards.length);
    } else {
      setIdx((i) => i + 1);
      setInput('');
      setPicked(null);
      setFlipped(false);
      setShowHint(false);
      setFeedback(null);
    }
  };

  const checkTypedAnswer = () => {
    if (!card) return;
    if (feedback) {
      advance(score);
      return;
    }
    const val = input.trim();
    if (!val) return;
    const ok = val.toLowerCase() === card.word.trim().toLowerCase();
    onCardResult(card.id, ok);
    const nextScore = score + (ok ? 1 : 0);
    if (ok) setScore(nextScore);
    speakWord(card.word, settings);
    setFeedback({
      ok,
      text: ok
        ? `Chính xác! ${card.word} ${card.ipa} — ${card.meaning} (Đã tăng cấp độ nhớ)`
        : `Đáp án đúng: ${card.word} (${card.meaning})`,
    });
  };

  if (done || !card) {
    return (
      <ResultPanel
        title="Hoàn thành phiên Ôn từ vựng tổng hợp!"
        score={score}
        total={cards.length}
        subtitle={`Chính xác ${score}/${cards.length} từ. Các từ trả lời đúng đã tự động nâng cấp độ nhớ sâu!`}
        onReplay={() => {
          setIdx(0);
          setScore(0);
          setInput('');
          setPicked(null);
          setFlipped(false);
          setShowHint(false);
          setFeedback(null);
          setDone(false);
          onReplay();
        }}
        onBack={onBack}
      />
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Live In-Game Exercise Customization Bar */}
      <div className="flex items-center justify-between flex-wrap gap-2.5 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
          <SlidersHorizontal className="w-3.5 h-3.5 text-blue-600" />
          <span>Tùy chọn dạng bài ngay khi chơi:</span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {MIXED_MODE_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = safeModes.includes(opt.id);
            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={active}
                onClick={() => toggleModeLive(opt.id)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                  active
                    ? 'bg-blue-50 border-blue-500 text-blue-700'
                    : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Progress + Current Card Level */}
      <div className="flex items-center justify-between text-xs font-bold text-slate-500 tabular-nums">
        <div className="flex items-center gap-2.5">
          <LevelRing level={card.srs.level} size={28} noReview={card.srs.noReview} />
          <span>
            Từ {idx + 1} / {cards.length} ·{' '}
            <strong className="text-blue-700">
              {currentType === 'quiz'
                ? 'Trắc nghiệm'
                : currentType === 'dictation'
                  ? 'Nghe viết'
                  : currentType === 'typing'
                    ? 'Gõ từ vựng'
                    : 'Flashcard'}
            </strong>
          </span>
        </div>
        <span className="text-emerald-600">Đã nhớ đúng: {score}</span>
      </div>

      {/* 1) QUIZ SUB-QUESTION */}
      {currentType === 'quiz' && (
        <div className="text-center space-y-5 pt-1">
          {settings.showImageHints && card.image && (
            <div className="w-32 h-24 mx-auto rounded-2xl bg-blue-50/40 border border-blue-100 p-2 flex items-center justify-center">
              <img
                src={card.image}
                alt={card.word}
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain"
              />
            </div>
          )}

          <div className="space-y-1">
            <div className="flex items-center justify-center gap-2">
              <span className="text-3xl font-extrabold text-slate-900">{card.word}</span>
              <button
                type="button"
                aria-label={`Phát âm ${card.word}`}
                onClick={() => speakWord(card.word, settings)}
                className="p-2 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white cursor-pointer transition-colors"
              >
                <Volume2 className="w-4 h-4" />
              </button>
            </div>
            {card.ipa && <div className="text-sm font-mono text-slate-500">{card.ipa}</div>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {options.map((opt) => {
              const isPicked = picked === opt.id;
              const isCorrect = opt.id === card.id;
              let cls =
                'border-slate-200 bg-white text-slate-800 hover:border-blue-400 hover:bg-blue-50/40';
              if (picked) {
                if (isCorrect) cls = 'border-emerald-500 bg-emerald-50 text-emerald-800';
                else if (isPicked) cls = 'border-rose-500 bg-rose-50 text-rose-700 animate-shake';
                else cls = 'border-slate-200 bg-slate-50 text-slate-400';
              }
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={Boolean(picked)}
                  onClick={() => {
                    setPicked(opt.id);
                    const ok = opt.id === card.id;
                    onCardResult(card.id, ok);
                    const nextS = score + (ok ? 1 : 0);
                    if (ok) setScore(nextS);
                    setTimeout(() => advance(nextS), 750);
                  }}
                  className={`p-4 rounded-2xl border-2 text-sm font-bold transition-all cursor-pointer ${cls}`}
                >
                  {opt.meaning}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 2) DICTATION SUB-QUESTION */}
      {currentType === 'dictation' && (
        <div className="text-center space-y-4 pt-1">
          <div className="flex items-center justify-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={() => speakWord(card.word, settings)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm cursor-pointer"
            >
              <Volume2 className="w-4 h-4" />
              Nghe phát âm
            </button>
            <button
              type="button"
              onClick={() => speakWord(card.word, settings, 0.65)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50 cursor-pointer"
            >
              <Turtle className="w-4 h-4" />
              Đọc chậm
            </button>
            <button
              type="button"
              onClick={() => setShowHint(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-amber-700 bg-amber-50 font-semibold text-sm hover:bg-amber-100 cursor-pointer"
            >
              <Lightbulb className="w-4 h-4" />
              Gợi ý
            </button>
          </div>

          {showHint && (
            <div className="text-xs font-semibold text-slate-600">
              Gợi ý: <strong className="font-mono text-blue-700">{card.word[0]}...</strong> ({card.word.length} ký tự) · Nghĩa: <strong>{card.meaning}</strong>
            </div>
          )}

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                checkTypedAnswer();
              }
            }}
            placeholder="Nghe và gõ lại từ tiếng Anh..."
            autoFocus
            className="w-full max-w-md mx-auto block px-4 py-3 text-center text-lg font-bold border-2 border-slate-200 focus:border-blue-600 rounded-2xl focus:outline-none"
          />

          {feedback && (
            <div
              className={`p-3 rounded-xl text-sm font-semibold ${
                feedback.ok
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}
            >
              {feedback.text}
            </div>
          )}

          <div className="flex items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={checkTypedAnswer}
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm cursor-pointer"
            >
              {feedback ? 'Từ tiếp theo (Enter)' : 'Kiểm tra (Enter)'}
            </button>
            {!feedback && (
              <button
                type="button"
                onClick={() => {
                  onCardResult(card.id, false);
                  setFeedback({ ok: false, text: `Đáp án đúng: ${card.word} (${card.meaning})` });
                }}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 cursor-pointer"
              >
                Xem đáp án
              </button>
            )}
          </div>
        </div>
      )}

      {/* 3) TYPING SUB-QUESTION */}
      {currentType === 'typing' && (
        <div className="text-center space-y-4 pt-1">
          {settings.showImageHints && card.image && (
            <div className="w-32 h-24 mx-auto rounded-2xl bg-emerald-50/40 border border-emerald-100 p-2 flex items-center justify-center">
              <img
                src={card.image}
                alt={card.word}
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain"
              />
            </div>
          )}

          <div>
            <div className="text-xs font-medium text-slate-500">
              Nhìn nghĩa tiếng Việt và gõ từ tiếng Anh:
            </div>
            <div className="text-2xl font-extrabold text-slate-900 mt-1">{card.meaning}</div>
          </div>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                checkTypedAnswer();
              }
            }}
            placeholder="Nhập từ tiếng Anh..."
            autoFocus
            className="w-full max-w-md mx-auto block px-4 py-3 text-center text-lg font-bold border-2 border-slate-200 focus:border-emerald-600 rounded-2xl focus:outline-none"
          />

          {feedback && (
            <div
              className={`p-3 rounded-xl text-sm font-semibold ${
                feedback.ok
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}
            >
              {feedback.text}
            </div>
          )}

          <div className="flex items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={checkTypedAnswer}
              className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm cursor-pointer"
            >
              {feedback ? 'Từ tiếp theo (Enter)' : 'Kiểm tra (Enter)'}
            </button>
            {!feedback && (
              <button
                type="button"
                onClick={() => {
                  onCardResult(card.id, false);
                  setFeedback({ ok: false, text: `Đáp án đúng: ${card.word} (${card.meaning})` });
                }}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 cursor-pointer"
              >
                Xem đáp án
              </button>
            )}
          </div>
        </div>
      )}

      {/* 4) FLASHCARD SUB-QUESTION */}
      {currentType === 'flashcard' && (
        <div className="space-y-4 pt-1">
          <div className="perspective-1200">
            <div
              role="button"
              tabIndex={0}
              onClick={() => setFlipped((f) => !f)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setFlipped((f) => !f);
                }
              }}
              className={`relative w-full min-h-[260px] transform-style-3d transition-transform duration-500 cursor-pointer ${
                flipped ? 'rotate-y-180' : ''
              }`}
            >
              <div className="absolute inset-0 backface-hidden rounded-3xl border border-blue-200 bg-gradient-to-b from-white to-blue-50/40 p-6 flex flex-col items-center justify-center text-center">
                <button
                  type="button"
                  aria-label={`Phát âm ${card.word}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    speakWord(card.word, settings);
                  }}
                  className="absolute top-4 right-4 p-2 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white cursor-pointer"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
                <div className="text-3xl font-extrabold text-slate-900">{card.word}</div>
                {card.ipa && <div className="text-sm font-mono text-blue-600 mt-1">{card.ipa}</div>}
                <div className="text-xs text-slate-400 mt-4">Nhấn vào thẻ để lật xem nghĩa</div>
              </div>

              <div className="absolute inset-0 backface-hidden rotate-y-180 rounded-3xl border border-blue-300 bg-white p-6 flex flex-col items-center justify-center text-center">
                <div className="text-2xl font-extrabold text-blue-700">{card.meaning}</div>
                {card.example && (
                  <p className="mt-3 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-3 max-w-md">
                    {card.example}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                onCardResult(card.id, false);
                advance(score);
              }}
              className="py-3 rounded-2xl border-2 border-rose-200 text-rose-700 font-bold text-sm hover:bg-rose-50 cursor-pointer"
            >
              Chưa nhớ (Về Cấp 1)
            </button>
            <button
              type="button"
              onClick={() => {
                onCardResult(card.id, true);
                const nextS = score + 1;
                setScore(nextS);
                advance(nextS);
              }}
              className="py-3 rounded-2xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 cursor-pointer"
            >
              Đã nhớ (Tăng cấp độ)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ==================== SHARED RESULT PANEL ==================== */
function ResultPanel({
  title,
  score,
  total,
  subtitle,
  onReplay,
  onBack,
}: {
  title: string;
  score: number;
  total: number;
  subtitle?: string;
  onReplay: () => void;
  onBack: () => void;
}) {
  const accuracy = Math.round((score / Math.max(1, total)) * 100);
  return (
    <div className="py-8 text-center space-y-4">
      <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
        <Check className="w-8 h-8" />
      </div>
      <h3 className="text-2xl font-extrabold text-slate-900">{title}</h3>
      <p className="text-sm text-slate-600">
        {subtitle || `Kết quả chính xác ${score} / ${total} (${accuracy}%). Cấp độ nhớ sâu đã được cập nhật!`}
      </p>
      <div className="flex items-center justify-center gap-3 pt-2">
        <button
          type="button"
          onClick={onReplay}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" />
          Chơi lại
        </button>
        <button
          type="button"
          onClick={onBack}
          className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-semibold text-sm hover:bg-slate-50 cursor-pointer"
        >
          Về Ôn tập & Game
        </button>
      </div>
    </div>
  );
}
