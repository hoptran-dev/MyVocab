import type {
  AppState,
  GameFilterConfig,
  MemoryLevel,
  MixedExerciseType,
  SRSState,
  VocabCard,
} from '../types/vocab';

export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

export interface LevelSpec {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  label: string;
  intervalLabel: string;
  intervalMs: number;
  color: string;
  trackColor: string;
  badgeBg: string;
  badgeText: string;
}

/**
 * Exact 6-level Spaced Repetition schedule (Ebbinghaus curve):
 * Level 1: 2 hours
 * Level 2: 1 day
 * Level 3: 2 days
 * Level 4: 3 days
 * Level 5: 5 days
 * Level 6 (Nhớ sâu): 8 days (customizable or "Không ôn lại")
 */
export const SRS_LEVEL_SPECS: readonly LevelSpec[] = [
  {
    level: 1,
    label: 'Cấp độ 1',
    intervalLabel: 'Sau 2 giờ',
    intervalMs: 2 * HOUR_MS,
    color: '#F97316',
    trackColor: '#E5E7EB',
    badgeBg: '#FFF7ED',
    badgeText: '#C2410C',
  },
  {
    level: 2,
    label: 'Cấp độ 2',
    intervalLabel: 'Sau 1 ngày',
    intervalMs: 1 * DAY_MS,
    color: '#FACC15',
    trackColor: '#E5E7EB',
    badgeBg: '#FEFCE8',
    badgeText: '#A16207',
  },
  {
    level: 3,
    label: 'Cấp độ 3',
    intervalLabel: 'Sau 2 ngày',
    intervalMs: 2 * DAY_MS,
    color: '#84CC16',
    trackColor: '#E5E7EB',
    badgeBg: '#F7FEE7',
    badgeText: '#4D7C0F',
  },
  {
    level: 4,
    label: 'Cấp độ 4',
    intervalLabel: 'Sau 3 ngày',
    intervalMs: 3 * DAY_MS,
    color: '#10B981',
    trackColor: '#E5E7EB',
    badgeBg: '#ECFDF5',
    badgeText: '#047857',
  },
  {
    level: 5,
    label: 'Cấp độ 5',
    intervalLabel: 'Sau 5 ngày',
    intervalMs: 5 * DAY_MS,
    color: '#06B6D4',
    trackColor: '#E5E7EB',
    badgeBg: '#ECFEFF',
    badgeText: '#0E7490',
  },
  {
    level: 6,
    label: 'Nhớ sâu',
    intervalLabel: 'Sau 8 ngày',
    intervalMs: 8 * DAY_MS,
    color: '#2563EB',
    trackColor: '#DBEAFE',
    badgeBg: '#EFF6FF',
    badgeText: '#1D4ED8',
  },
] as const;

export const DEFAULT_LEVEL6_DAYS = 8;

export function createInitialSRS(now: number = Date.now()): SRSState {
  return {
    level: 0,
    dueDate: now,
    level6ReviewDays: DEFAULT_LEVEL6_DAYS,
    noReview: false,
    reviewCount: 0,
  };
}

/**
 * Migrate legacy SM-2 srs object ({ reps, interval, ease, dueDate }) into 6-level SRSState.
 */
export function normalizeSRS(raw: unknown, now: number = Date.now()): SRSState {
  if (!raw || typeof raw !== 'object') {
    return createInitialSRS(now);
  }
  const obj = raw as Partial<SRSState> & { reps?: number; interval?: number };
  if (typeof obj.level === 'number' && obj.level >= 0 && obj.level <= 6) {
    return {
      level: obj.level as MemoryLevel,
      dueDate: obj.noReview ? null : (obj.dueDate ?? now),
      level6ReviewDays:
        typeof obj.level6ReviewDays === 'number' && obj.level6ReviewDays >= 1
          ? Math.round(obj.level6ReviewDays)
          : DEFAULT_LEVEL6_DAYS,
      noReview: Boolean(obj.noReview),
      reviewCount: typeof obj.reviewCount === 'number' ? obj.reviewCount : 0,
      lastReviewedAt: obj.lastReviewedAt,
    };
  }
  // Legacy migration from old HopVocab HTML SM-2 fields
  const reps = obj.reps ?? 0;
  const interval = obj.interval ?? 0;
  let level: MemoryLevel = 0;
  if (interval >= 8 || reps >= 6) level = 6;
  else if (reps >= 5) level = 5;
  else if (reps >= 4) level = 4;
  else if (reps >= 3) level = 3;
  else if (reps >= 2) level = 2;
  else if (reps >= 1) level = 1;

  return {
    level,
    dueDate: obj.dueDate ?? now,
    level6ReviewDays: DEFAULT_LEVEL6_DAYS,
    noReview: false,
    reviewCount: reps,
  };
}

export function getIntervalMsForLevel(
  level: MemoryLevel,
  level6ReviewDays: number = DEFAULT_LEVEL6_DAYS
): number {
  if (level <= 0) return 0;
  if (level === 6) {
    const safeDays = Math.max(1, Math.min(365, Math.round(level6ReviewDays || DEFAULT_LEVEL6_DAYS)));
    return safeDays * DAY_MS;
  }
  const spec = SRS_LEVEL_SPECS[level - 1];
  return spec ? spec.intervalMs : 2 * HOUR_MS;
}

export function isCardDue(card: VocabCard, now: number = Date.now()): boolean {
  const srs = card.srs;
  if (!srs) return true;
  if (srs.level === 6 && srs.noReview) return false;
  if (srs.dueDate === null) return false;
  return srs.dueDate <= now;
}

export function isCardMastered(card: VocabCard): boolean {
  return (card.srs?.level ?? 0) === 6;
}

export interface SRSReviewOutcome {
  nextSrs: SRSState;
  justReachedLevel6: boolean;
  intervalLabel: string;
}

/**
 * Evaluate a spaced repetition review answer:
 * - remembered = true: advances level by +1 (max 6) and schedules exact interval.
 * - remembered = false: drops card to Level 1 (review after 2 hours) and clears noReview.
 */
export function evaluateSrsReview(
  current: SRSState,
  remembered: boolean,
  now: number = Date.now()
): SRSReviewOutcome {
  const safeCurrent = normalizeSRS(current, now);
  if (!remembered) {
    return {
      nextSrs: {
        ...safeCurrent,
        level: 1,
        dueDate: now + 2 * HOUR_MS,
        noReview: false,
        reviewCount: safeCurrent.reviewCount + 1,
        lastReviewedAt: now,
      },
      justReachedLevel6: false,
      intervalLabel: 'Sau 2 giờ',
    };
  }

  const nextLevel = Math.min(6, safeCurrent.level + 1) as MemoryLevel;
  const justReachedLevel6 = safeCurrent.level < 6 && nextLevel === 6;

  if (nextLevel === 6 && safeCurrent.noReview && !justReachedLevel6) {
    return {
      nextSrs: {
        ...safeCurrent,
        level: 6,
        dueDate: null,
        noReview: true,
        reviewCount: safeCurrent.reviewCount + 1,
        lastReviewedAt: now,
      },
      justReachedLevel6: false,
      intervalLabel: 'Không ôn lại',
    };
  }

  const days6 = safeCurrent.level6ReviewDays || DEFAULT_LEVEL6_DAYS;
  const intervalMs = getIntervalMsForLevel(nextLevel, days6);
  const label =
    nextLevel === 6
      ? `Sau ${days6} ngày`
      : SRS_LEVEL_SPECS[nextLevel - 1]?.intervalLabel ?? 'Sau 2 giờ';

  return {
    nextSrs: {
      ...safeCurrent,
      level: nextLevel,
      dueDate: now + intervalMs,
      noReview: false,
      reviewCount: safeCurrent.reviewCount + 1,
      lastReviewedAt: now,
    },
    justReachedLevel6,
    intervalLabel: label,
  };
}

/**
 * Apply user's custom preference for a Level 6 (Nhớ sâu) card:
 * either review again after N custom days, or never review again (noReview = true).
 */
export function configureLevel6Schedule(
  current: SRSState,
  options: { noReview: boolean; reviewDays?: number },
  now: number = Date.now()
): SRSState {
  const safeCurrent = normalizeSRS(current, now);
  if (options.noReview) {
    return {
      ...safeCurrent,
      level: 6,
      noReview: true,
      dueDate: null,
    };
  }

  const safeDays = Math.max(
    1,
    Math.min(365, Math.round(options.reviewDays ?? safeCurrent.level6ReviewDays ?? DEFAULT_LEVEL6_DAYS))
  );
  return {
    ...safeCurrent,
    level: 6,
    noReview: false,
    level6ReviewDays: safeDays,
    dueDate: now + safeDays * DAY_MS,
  };
}

export function formatNextReviewCountdown(srs: SRSState, now: number = Date.now()): string {
  if (srs.level === 6 && srs.noReview) return 'Không ôn lại';
  if (srs.level === 0) return 'Từ mới · Học ngay';
  if (srs.dueDate === null) return 'Không ôn lại';
  const diff = srs.dueDate - now;
  if (diff <= 0) return 'Đến hạn ôn ngay';
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `Còn ${Math.max(1, mins)} phút`;
  const hours = Math.round(diff / HOUR_MS);
  if (hours < 24) return `Còn ${hours} giờ`;
  const days = Math.round(diff / DAY_MS);
  return `Còn ${days} ngày`;
}

export function getLevelDistribution(cards: VocabCard[]) {
  const counts: Record<MemoryLevel, number> & { archived: number; due: number } = {
    0: 0,
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
    6: 0,
    archived: 0,
    due: 0,
  };
  const now = Date.now();
  for (const card of cards) {
    const lvl = card.srs?.level ?? 0;
    counts[lvl] = (counts[lvl] || 0) + 1;
    if (lvl === 6 && card.srs?.noReview) counts.archived++;
    if (isCardDue(card, now)) counts.due++;
  }
  return counts;
}

export const DEFAULT_MIXED_MODES: readonly MixedExerciseType[] = [
  'quiz',
  'dictation',
  'typing',
  'flashcard',
];

/**
 * Pick the exercise type for question `index` based on currently enabled mixed modes.
 * Supports toggling modes live mid-session without breaking progression.
 */
export function pickMixedQuestionType(
  index: number,
  enabledModes: readonly MixedExerciseType[]
): MixedExerciseType {
  const safe = enabledModes.length > 0 ? enabledModes : DEFAULT_MIXED_MODES;
  return safe[Math.abs(index) % safe.length];
}

/**
 * Build the default deep-memory review queue for the "Ôn từ vựng" button:
 * prioritizes due cards first (lowest level first, except due level 5/6 prioritized),
 * then unmastered cards if fewer than needed, always excluding Level 6 noReview cards.
 */
export function selectDeepMemoryReviewQueue(
  cards: VocabCard[],
  deckId: string = 'all',
  maxCount: number = 20,
  now: number = Date.now()
): VocabCard[] {
  const inDeck = deckId === 'all' ? cards : cards.filter((c) => c.deckId === deckId);
  const due = inDeck
    .filter((c) => isCardDue(c, now))
    .sort((a, b) => (b.srs?.level ?? 0) - (a.srs?.level ?? 0));

  if (due.length > 0) {
    return due.slice(0, maxCount);
  }

  // Fallback: unmastered cards (Level 0..5) sorted by lowest level first
  const unmastered = inDeck
    .filter((c) => (c.srs?.level ?? 0) < 6)
    .sort((a, b) => (a.srs?.level ?? 0) - (b.srs?.level ?? 0));
  if (unmastered.length > 0) {
    return unmastered.slice(0, maxCount);
  }

  // Final fallback: Level 6 cards that still have review enabled
  const activeLevel6 = inDeck.filter((c) => !(c.srs?.level === 6 && c.srs?.noReview));
  return activeLevel6.slice(0, maxCount);
}

/**
 * Filter, sort, and slice cards for the Game Hub 4-box filter bar.
 */
export function filterGameCards(
  cards: VocabCard[],
  config: GameFilterConfig,
  now: number = Date.now(),
  rng: () => number = Math.random
): VocabCard[] {
  let result = cards.filter((card) => {
    if (config.deckId !== 'all' && card.deckId !== config.deckId) return false;
    const lvl = card.srs?.level ?? 0;
    if (config.levelFilter !== undefined && config.levelFilter !== 'all') {
      if (lvl !== config.levelFilter) return false;
    }
    switch (config.statusFilter) {
      case 'unmastered':
        return lvl < 6;
      case 'due':
        return isCardDue(card, now);
      case 'learning':
        return lvl >= 1 && lvl <= 5;
      case 'level6':
        return lvl === 6;
      case 'all':
      default:
        return true;
    }
  });

  result = [...result];
  switch (config.orderBy) {
    case 'newest':
      result.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      break;
    case 'oldest':
      result.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      break;
    case 'az':
      result.sort((a, b) => a.word.localeCompare(b.word));
      break;
    case 'level_asc':
      result.sort((a, b) => (a.srs?.level ?? 0) - (b.srs?.level ?? 0));
      break;
    case 'random':
    default:
      for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
      }
      break;
  }

  if (config.quantity !== 'all' && typeof config.quantity === 'number') {
    return result.slice(0, config.quantity);
  }
  return result;
}

export interface ParsedBulkLine {
  word: string;
  meaning: string;
  ipa: string;
  example: string;
}

export function parseBulkLines(text: string): ParsedBulkLine[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const sep = line.includes('\t')
        ? '\t'
        : line.includes('|')
          ? '|'
          : line.includes(';')
            ? ';'
            : ',';
      const parts = line.split(sep).map((s) => s.trim());
      if (parts.length >= 2 && parts[0] && parts[1]) {
        return {
          word: parts[0],
          meaning: parts[1],
          ipa: parts[2] || '',
          example: parts[3] || '',
        };
      }
      return null;
    })
    .filter((item): item is ParsedBulkLine => item !== null);
}

export interface PassageSegment {
  text: string;
  candidateId?: string;
}

/**
 * Splits a passage into plain text and highlighted word segments matching extracted candidates.
 */
export function segmentPassageWithWords(
  passage: string,
  candidates: Array<{ id: string; word: string; matchedForm?: string }>
): PassageSegment[] {
  if (!passage || !candidates.length) {
    return passage ? [{ text: passage }] : [];
  }

  const lookup = new Map<string, string>();
  const terms: string[] = [];

  for (const cand of candidates) {
    const forms = [cand.matchedForm, cand.word]
      .map((s) => (s || '').trim())
      .filter((s) => s.length >= 2);
    for (const form of forms) {
      const lower = form.toLowerCase();
      if (!lookup.has(lower)) {
        lookup.set(lower, cand.id);
        terms.push(form);
      }
    }
  }

  if (!terms.length) return [{ text: passage }];

  // Match longer phrases before shorter words
  terms.sort((a, b) => b.length - a.length);
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');

  const segments: PassageSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(passage)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: passage.slice(lastIndex, match.index) });
    }
    const matchedText = match[0];
    segments.push({
      text: matchedText,
      candidateId: lookup.get(matchedText.toLowerCase()),
    });
    lastIndex = match.index + matchedText.length;
  }

  if (lastIndex < passage.length) {
    segments.push({ text: passage.slice(lastIndex) });
  }
  return segments;
}

export function svgToDataUrl(svg: string): string {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

export function todayDateString(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

export function createSeedState(now: number = Date.now()): AppState {
  const svgApple = svgToDataUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 180"><ellipse cx="120" cy="154" rx="54" ry="9" fill="#E2E8F0"/><path d="M120 44 C122 26 132 18 138 18 C134 28 128 36 125 46" stroke="#6B3E26" stroke-width="6" stroke-linecap="round" fill="none"/><path d="M120 44 C102 22 86 22 88 22 C88 38 102 48 120 44Z" fill="#22C55E"/><path d="M120 48 C92 38 62 56 64 96 C66 136 92 154 116 150 C120 149 124 149 128 150 C152 154 178 134 176 94 C174 56 146 38 120 48Z" fill="#EF4444"/><ellipse cx="152" cy="76" rx="6" ry="11" transform="rotate(-25 152 76)" fill="#FEE2E2"/></svg>`
  );
  const svgCompass = svgToDataUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 180"><circle cx="120" cy="90" r="56" fill="#DBEAFE" stroke="#2563EB" stroke-width="6"/><circle cx="120" cy="90" r="44" fill="#FFFFFF"/><polygon points="120,52 132,90 120,100 108,90" fill="#EF4444"/><polygon points="120,128 132,90 120,80 108,90" fill="#1E3A8A"/><circle cx="120" cy="90" r="6" fill="#F8FAFC" stroke="#1E3A8A" stroke-width="3"/></svg>`
  );
  const svgBook = svgToDataUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 180"><rect x="46" y="42" width="74" height="98" rx="10" fill="#2563EB"/><rect x="120" y="42" width="74" height="98" rx="10" fill="#3B82F6"/><rect x="54" y="50" width="60" height="82" rx="5" fill="#FFFFFF"/><rect x="126" y="50" width="60" height="82" rx="5" fill="#F8FAFC"/><line x1="65" y1="72" x2="104" y2="72" stroke="#94A3B8" stroke-width="5" stroke-linecap="round"/><line x1="65" y1="90" x2="98" y2="90" stroke="#CBD5E1" stroke-width="5" stroke-linecap="round"/><line x1="136" y1="72" x2="175" y2="72" stroke="#94A3B8" stroke-width="5" stroke-linecap="round"/><line x1="136" y1="90" x2="168" y2="90" stroke="#CBD5E1" stroke-width="5" stroke-linecap="round"/></svg>`
  );
  const svgCoffee = svgToDataUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 180"><path d="M158 76 h14 a16 16 0 0 1 0 32 h-14" fill="none" stroke="#0284C7" stroke-width="9"/><path d="M74 68 h84 v52 a28 28 0 0 1 -28 28 h-28 a28 28 0 0 1 -28 -28 z" fill="#0EA5E9"/><ellipse cx="116" cy="68" rx="42" ry="8" fill="#78350F"/><path d="M98 46 Q104 34 98 24 M118 44 Q124 32 118 22 M138 46 Q144 34 138 24" stroke="#94A3B8" stroke-width="4" fill="none" stroke-linecap="round"/></svg>`
  );
  const svgBulb = svgToDataUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 180"><circle cx="120" cy="78" r="38" fill="#FEF08A" stroke="#EAB308" stroke-width="5"/><path d="M102 112 h36 l-4 22 h-28 z" fill="#94A3B8"/><rect x="108" y="136" width="24" height="9" rx="4" fill="#64748B"/><line x1="120" y1="22" x2="120" y2="32" stroke="#F59E0B" stroke-width="5" stroke-linecap="round"/><line x1="72" y1="42" x2="80" y2="48" stroke="#F59E0B" stroke-width="5" stroke-linecap="round"/><line x1="168" y1="42" x2="160" y2="48" stroke="#F59E0B" stroke-width="5" stroke-linecap="round"/></svg>`
  );
  const svgRocket = svgToDataUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 180"><path d="M120 30 C145 55 150 95 142 125 L98 125 C90 95 95 55 120 30 Z" fill="#6366F1"/><circle cx="120" cy="82" r="14" fill="#E0E7FF" stroke="#312E81" stroke-width="4"/><polygon points="98,104 76,128 98,125" fill="#EC4899"/><polygon points="142,104 164,128 142,125" fill="#EC4899"/><path d="M108 126 Q120 156 132 126 Z" fill="#F97316"/></svg>`
  );

  const deckCore = 'deck_ielts_core';
  const deckDaily = 'deck_daily_comm';

  const cards: VocabCard[] = [
    {
      id: 'seed_1',
      deckId: deckCore,
      word: 'resilient',
      pos: 'adj',
      ipa: '/rɪˈzɪl.i.ənt/',
      meaning: 'kiên cường, nhanh chóng phục hồi',
      example: 'Local businesses proved remarkably resilient during the economic shift.',
      cefr: 'C1',
      image: svgRocket,
      createdAt: now - 10 * DAY_MS,
      srs: {
        level: 5,
        dueDate: now - HOUR_MS, // Due right now -> 1 click "Đã nhớ" graduates to Level 6!
        level6ReviewDays: 8,
        noReview: false,
        reviewCount: 5,
        lastReviewedAt: now - 5 * DAY_MS,
      },
    },
    {
      id: 'seed_2',
      deckId: deckCore,
      word: 'breakthrough',
      pos: 'n',
      ipa: '/ˈbreɪk.θruː/',
      meaning: 'bước đột phá quan trọng',
      example: 'Researchers announced a major breakthrough in clean battery storage.',
      cefr: 'B2',
      image: svgBulb,
      createdAt: now - 9 * DAY_MS,
      srs: {
        level: 5,
        dueDate: now - 30 * 60_000, // Also ready to reach Level 6!
        level6ReviewDays: 8,
        noReview: false,
        reviewCount: 5,
        lastReviewedAt: now - 5 * DAY_MS,
      },
    },
    {
      id: 'seed_3',
      deckId: deckCore,
      word: 'navigate',
      pos: 'v',
      ipa: '/ˈnæv.ɪ.ɡeɪt/',
      meaning: 'điều hướng, xoay xở vượt qua',
      example: 'Mentors help new graduates navigate complex career choices.',
      cefr: 'B2',
      image: svgCompass,
      createdAt: now - 8 * DAY_MS,
      srs: {
        level: 3,
        dueDate: now - 2 * HOUR_MS,
        level6ReviewDays: 8,
        noReview: false,
        reviewCount: 3,
        lastReviewedAt: now - 2 * DAY_MS,
      },
    },
    {
      id: 'seed_4',
      deckId: deckCore,
      word: 'collaborate',
      pos: 'v',
      ipa: '/kəˈlæb.ə.reɪt/',
      meaning: 'cộng tác, hợp tác chặt chẽ',
      example: 'Designers and engineers collaborate closely to ship the product.',
      cefr: 'B2',
      image: '',
      createdAt: now - 7 * DAY_MS,
      srs: {
        level: 2,
        dueDate: now - HOUR_MS,
        level6ReviewDays: 8,
        noReview: false,
        reviewCount: 2,
        lastReviewedAt: now - DAY_MS,
      },
    },
    {
      id: 'seed_5',
      deckId: deckCore,
      word: 'sustainable',
      pos: 'adj',
      ipa: '/səˈsteɪ.nə.bəl/',
      meaning: 'bền vững, thân thiện lâu dài',
      example: 'Cities are investing in sustainable public transit networks.',
      cefr: 'B2',
      image: '',
      createdAt: now - 6 * DAY_MS,
      srs: {
        level: 1,
        dueDate: now - 20 * 60_000,
        level6ReviewDays: 8,
        noReview: false,
        reviewCount: 1,
        lastReviewedAt: now - 3 * HOUR_MS,
      },
    },
    {
      id: 'seed_6',
      deckId: deckCore,
      word: 'synthesize',
      pos: 'v',
      ipa: '/ˈsɪn.θə.saɪz/',
      meaning: 'tổng hợp thông tin thành một thể thống nhất',
      example: 'The report synthesizes findings from twelve clinical trials.',
      cefr: 'C1',
      image: svgBook,
      createdAt: now - 5 * DAY_MS,
      srs: {
        level: 0,
        dueDate: now,
        level6ReviewDays: 8,
        noReview: false,
        reviewCount: 0,
      },
    },
    {
      id: 'seed_7',
      deckId: deckCore,
      word: 'mitigate',
      pos: 'v',
      ipa: '/ˈmɪt.ɪ.ɡeɪt/',
      meaning: 'giảm thiểu tác động tiêu cực',
      example: 'Early flood barriers help mitigate storm damage along the coast.',
      cefr: 'C1',
      image: '',
      createdAt: now - 4 * DAY_MS,
      srs: {
        level: 4,
        dueDate: now + 2 * DAY_MS,
        level6ReviewDays: 8,
        noReview: false,
        reviewCount: 4,
        lastReviewedAt: now - DAY_MS,
      },
    },
    {
      id: 'seed_8',
      deckId: deckCore,
      word: 'insightful',
      pos: 'adj',
      ipa: '/ˈɪn.saɪt.fəl/',
      meaning: 'sâu sắc, thấu đáo',
      example: 'Her presentation offered insightful recommendations for the team.',
      cefr: 'B2',
      image: svgBulb,
      createdAt: now - 14 * DAY_MS,
      srs: {
        level: 6,
        dueDate: now + 6 * DAY_MS,
        level6ReviewDays: 8,
        noReview: false,
        reviewCount: 6,
        lastReviewedAt: now - 2 * DAY_MS,
      },
    },
    {
      id: 'seed_9',
      deckId: deckDaily,
      word: 'apple',
      pos: 'n',
      ipa: '/ˈæp.əl/',
      meaning: 'quả táo',
      example: 'She packs a crisp red apple for her afternoon break.',
      cefr: 'A1',
      image: svgApple,
      createdAt: now - 20 * DAY_MS,
      srs: {
        level: 6,
        dueDate: null,
        level6ReviewDays: 8,
        noReview: true, // Example of Level 6 "Không ôn lại"
        reviewCount: 7,
        lastReviewedAt: now - 8 * DAY_MS,
      },
    },
    {
      id: 'seed_10',
      deckId: deckDaily,
      word: 'coffee',
      pos: 'n',
      ipa: '/ˈkɒf.i/',
      meaning: 'cà phê',
      example: 'I brew a fresh cup of coffee before reviewing my flashcards.',
      cefr: 'A1',
      image: svgCoffee,
      createdAt: now - 3 * DAY_MS,
      srs: {
        level: 2,
        dueDate: now + 14 * HOUR_MS,
        level6ReviewDays: 8,
        noReview: false,
        reviewCount: 2,
        lastReviewedAt: now - 10 * HOUR_MS,
      },
    },
    {
      id: 'seed_11',
      deckId: deckDaily,
      word: 'take off',
      pos: 'phrase',
      ipa: '/teɪk ɒf/',
      meaning: 'cất cánh; phát triển nhanh chóng',
      example: 'The startup began to take off after launching its mobile app.',
      cefr: 'B1',
      image: svgRocket,
      createdAt: now - 2 * DAY_MS,
      srs: {
        level: 1,
        dueDate: now - 10 * 60_000,
        level6ReviewDays: 8,
        noReview: false,
        reviewCount: 1,
        lastReviewedAt: now - 3 * HOUR_MS,
      },
    },
    {
      id: 'seed_12',
      deckId: deckDaily,
      word: 'knowledge',
      pos: 'n',
      ipa: '/ˈnɒl.ɪdʒ/',
      meaning: 'kiến thức, sự am hiểu',
      example: 'Spaced repetition turns short-term study into lasting knowledge.',
      cefr: 'B1',
      image: svgBook,
      createdAt: now - DAY_MS,
      srs: {
        level: 0,
        dueDate: now,
        level6ReviewDays: 8,
        noReview: false,
        reviewCount: 0,
      },
    },
  ];

  return {
    decks: [
      {
        id: deckCore,
        name: 'IELTS & Công việc cốt lõi',
        desc: 'Từ vựng học thuật & giao tiếp chuyên nghiệp (B2–C1)',
      },
      {
        id: deckDaily,
        name: 'Giao tiếp hàng ngày',
        desc: 'Từ vựng và cụm động từ thông dụng trong đời sống',
      },
    ],
    cards,
    stats: {
      streak: 3,
      lastDate: todayDateString(new Date(now)),
      todayCount: 6,
      dailyGoal: 20,
      coins: 85,
    },
    settings: {
      voiceLang: 'en-US',
      voiceRate: 1,
      audioVolume: 70,
      showImageHints: true,
      autoUpdateSrsInGames: true,
    },
    history: [],
  };
}
