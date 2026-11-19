export type MemoryLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface SRSState {
  /** 0 = Mới (chưa học), 1..5 = Cấp độ 1..5, 6 = Nhớ sâu */
  level: MemoryLevel;
  /** Timestamp (ms) for next scheduled review; null if Level 6 noReview is active */
  dueDate: number | null;
  /** Custom interval in days chosen when card reaches Level 6 (default 8) */
  level6ReviewDays: number;
  /** If true at Level 6, card is archived / never scheduled for review again */
  noReview: boolean;
  /** Total times reviewed */
  reviewCount: number;
  /** Last review timestamp */
  lastReviewedAt?: number;
}

export interface VocabCard {
  id: string;
  deckId: string;
  word: string;
  pos: string;
  ipa: string;
  meaning: string;
  example: string;
  contextNote?: string;
  cefr?: string;
  image: string;
  createdAt: number;
  srs: SRSState;
}

export interface Deck {
  id: string;
  name: string;
  desc: string;
}

export type MixedExerciseType = 'quiz' | 'dictation' | 'typing' | 'flashcard';

export type GameModeId =
  | 'mixed'
  | 'flashcard'
  | 'quiz'
  | 'matching'
  | 'typing'
  | 'dictation'
  | 'rain'
  | 'speed'
  | 'special';

export interface MatchHistoryItem {
  id: string;
  mode: GameModeId | 'srs';
  modeLabel: string;
  deckName: string;
  score: number;
  total: number;
  accuracy: number;
  coinsEarned: number;
  playedAt: number;
}

export interface AppStats {
  streak: number;
  lastDate: string;
  todayCount: number;
  dailyGoal: number;
  coins: number;
}

export interface AppSettings {
  voiceLang: 'en-US' | 'en-GB';
  voiceRate: number;
  audioVolume: number; // 0 to 100
  showImageHints: boolean;
  autoUpdateSrsInGames: boolean;
  mixedModes?: MixedExerciseType[];
}

export interface AppState {
  decks: Deck[];
  cards: VocabCard[];
  stats: AppStats;
  settings: AppSettings;
  history: MatchHistoryItem[];
}

export type ViewId =
  | 'dashboard'
  | 'games'
  | 'ai'
  | 'dictionary'
  | 'vocab';

export type GameStatusFilter =
  | 'unmastered'
  | 'due'
  | 'learning'
  | 'level6'
  | 'all';

export type GameOrderBy =
  | 'random'
  | 'newest'
  | 'oldest'
  | 'az'
  | 'level_asc';

export interface GameFilterConfig {
  deckId: string;
  statusFilter: GameStatusFilter;
  orderBy: GameOrderBy;
  quantity: number | 'all';
  levelFilter?: MemoryLevel | 'all';
}

export interface ExtractedWordCandidate {
  id: string;
  word: string;
  matchedForm: string;
  pos: string;
  ipa: string;
  meaning: string;
  generalMeaning: string;
  contextSentence: string;
  cefr: string;
  image: string;
  selected: boolean;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  model?: string;
  sources?: GroundingSource[];
}

export interface OfflineDictPronunciation {
  ipa: string;
  region: string;
}

export interface OfflineDictDefinition {
  definition: string;
  pos: string;
  posLabel: string;
  subPos?: string;
  example: string;
}

export interface OfflineDictEntry {
  word: string;
  pronunciations: OfflineDictPronunciation[];
  definitions: OfflineDictDefinition[];
}

export interface OfflineDictLookupResult {
  query: string;
  exact: OfflineDictEntry | null;
  related: Array<{ word: string; preview: string; ipa: string }>;
  reverseMatches: Array<{ word: string; definition: string; pos: string; posLabel: string; ipa: string }>;
  source: 'sqlite' | 'indexeddb';
}
