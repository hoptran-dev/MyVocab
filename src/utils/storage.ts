import type { AppState, VocabCard } from '../types/vocab';
import { createSeedState, DAY_MS, normalizeSRS, todayDateString } from './srs';

const IDB_NAME = 'HopVocabDB_v2';
const IDB_STORE = 'kv';
const LEGACY_IDB_NAME = 'BlueVocabDB';
const LEGACY_LS_KEY = 'bluevocab_parroto_v1';

function openDB(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGet<T = unknown>(key: string, dbName: string = IDB_NAME): Promise<T | undefined> {
  if (typeof indexedDB === 'undefined') return undefined;
  const db = await openDB(dbName);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function idbSet(key: string, value: unknown, dbName: string = IDB_NAME): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openDB(dbName);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const req = tx.objectStore(IDB_STORE).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function hydrateState(raw: Partial<AppState> | null | undefined): AppState {
  const seed = createSeedState();
  if (!raw || !Array.isArray(raw.decks) || !Array.isArray(raw.cards)) {
    return seed;
  }

  const now = Date.now();
  const normalizedCards: VocabCard[] = raw.cards.map((c, idx) => ({
    id: c.id || `card_${idx}_${now}`,
    deckId: c.deckId || raw.decks![0]?.id || 'deck_default',
    word: c.word || '',
    pos: c.pos || '',
    ipa: c.ipa || '',
    meaning: c.meaning || '',
    example: c.example || '',
    contextNote: c.contextNote || '',
    cefr: c.cefr || '',
    image: c.image || '',
    createdAt: typeof c.createdAt === 'number' ? c.createdAt : now - idx * 1000,
    srs: normalizeSRS(c.srs, now),
  }));

  const merged: AppState = {
    decks:
      raw.decks.length > 0
        ? raw.decks
        : [{ id: 'deck_default', name: 'Bộ thẻ của tôi', desc: 'Kho từ vựng cá nhân' }],
    cards: normalizedCards,
    stats: {
      streak: raw.stats?.streak ?? 0,
      lastDate: raw.stats?.lastDate ?? '',
      todayCount: raw.stats?.todayCount ?? 0,
      dailyGoal: raw.stats?.dailyGoal ?? 20,
      coins: raw.stats?.coins ?? 0,
    },
    settings: {
      voiceLang: raw.settings?.voiceLang === 'en-GB' ? 'en-GB' : 'en-US',
      voiceRate: typeof raw.settings?.voiceRate === 'number' ? raw.settings.voiceRate : 1,
      audioVolume:
        typeof raw.settings?.audioVolume === 'number' ? raw.settings.audioVolume : 70,
      showImageHints: raw.settings?.showImageHints ?? true,
      autoUpdateSrsInGames: raw.settings?.autoUpdateSrsInGames ?? true,
    },
    history: Array.isArray(raw.history) ? raw.history : [],
  };

  // Daily reset check
  const today = todayDateString();
  if (merged.stats.lastDate && merged.stats.lastDate !== today) {
    const gap =
      (new Date(today).getTime() - new Date(merged.stats.lastDate).getTime()) / DAY_MS;
    if (gap > 1.5) merged.stats.streak = 0;
    merged.stats.todayCount = 0;
  }

  return merged;
}

export async function loadAppState(): Promise<AppState> {
  try {
    const saved = await idbGet<Partial<AppState>>('appState', IDB_NAME);
    if (saved) return hydrateState(saved);

    // Try migrating from legacy BlueVocabDB or localStorage
    try {
      const legacyIdb = await idbGet<Partial<AppState>>('appState', LEGACY_IDB_NAME);
      if (legacyIdb && Array.isArray(legacyIdb.cards) && legacyIdb.cards.length > 0) {
        const migrated = hydrateState(legacyIdb);
        await idbSet('appState', migrated, IDB_NAME);
        return migrated;
      }
    } catch {
      // Ignore if legacy DB doesn't exist
    }

    const legacyLs = localStorage.getItem(LEGACY_LS_KEY);
    if (legacyLs) {
      const parsed = JSON.parse(legacyLs) as Partial<AppState>;
      if (Array.isArray(parsed.cards) && parsed.cards.length > 0) {
        const migrated = hydrateState(parsed);
        await idbSet('appState', migrated, IDB_NAME);
        return migrated;
      }
    }
  } catch (err) {
    console.warn('Could not load saved state, using seed data:', err);
  }

  const initial = createSeedState();
  await saveAppState(initial).catch(() => {});
  return initial;
}

export async function saveAppState(state: AppState): Promise<void> {
  try {
    await idbSet('appState', state, IDB_NAME);
  } catch (err) {
    console.error('Failed to persist state to IndexedDB:', err);
  }
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}
