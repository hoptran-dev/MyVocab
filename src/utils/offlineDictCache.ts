import type { OfflineDictEntry, OfflineDictLookupResult } from '../types/vocab';
import { staticAssetUrl } from './api';

const DICT_DB_NAME = 'HopVocabOfflineDictDB';
const DICT_DB_VERSION = 1;
const STORE_NAME = 'entries';

let staticPackLoadingPromise: Promise<number> | null = null;

function openDictDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DICT_DB_NAME, DICT_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'word' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function cacheDictEntries(entries: OfflineDictEntry[]): Promise<number> {
  if (!entries.length || typeof indexedDB === 'undefined') return 0;
  try {
    const db = await openDictDb();
    return await new Promise<number>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const entry of entries) {
        if (entry.word) {
          store.put({
            ...entry,
            word: entry.word.toLowerCase(),
          });
        }
      }
      tx.oncomplete = () => resolve(entries.length);
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    return 0;
  }
}

export async function getCachedDictCount(): Promise<number> {
  if (typeof indexedDB === 'undefined') return 0;
  try {
    const db = await openDictDb();
    return await new Promise<number>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).count();
      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => resolve(0);
    });
  } catch {
    return 0;
  }
}

export async function ensureStaticOfflinePackLoaded(): Promise<number> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') return 0;
  const existing = await getCachedDictCount();
  if (existing > 0) return existing;

  if (!staticPackLoadingPromise) {
    staticPackLoadingPromise = fetch(staticAssetUrl('dict-offline-pack.json'))
      .then((res) => (res.ok ? res.json() : null))
      .then(async (data) => {
        const entries = Array.isArray(data?.entries) ? (data.entries as OfflineDictEntry[]) : [];
        if (!entries.length) return 0;
        await cacheDictEntries(entries);
        return getCachedDictCount();
      })
      .catch(() => 0)
      .finally(() => {
        staticPackLoadingPromise = null;
      });
  }

  return staticPackLoadingPromise;
}

export async function lookupInBrowserCache(rawQuery: string): Promise<OfflineDictLookupResult> {
  const q = rawQuery.trim().toLowerCase();
  const empty: OfflineDictLookupResult = {
    query: rawQuery.trim(),
    exact: null,
    related: [],
    reverseMatches: [],
    source: 'indexeddb',
  };
  if (!q || typeof indexedDB === 'undefined') return empty;

  try {
    await ensureStaticOfflinePackLoaded();
    const db = await openDictDb();
    const exact = await new Promise<OfflineDictEntry | null>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(q);
      req.onsuccess = () => resolve((req.result as OfflineDictEntry) || null);
      req.onerror = () => resolve(null);
    });

    const upperBound = q.slice(0, -1) + String.fromCharCode(q.charCodeAt(q.length - 1) + 1);
    const range = IDBKeyRange.bound(q, upperBound, false, true);
    const related = await new Promise<Array<{ word: string; preview: string; ipa: string }>>((resolve) => {
      const list: Array<{ word: string; preview: string; ipa: string }> = [];
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).openCursor(range);
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor || list.length >= 10) {
          resolve(list);
          return;
        }
        const val = cursor.value as OfflineDictEntry;
        if (val.word !== q) {
          list.push({
            word: val.word,
            preview: val.definitions?.[0]?.definition || '',
            ipa: val.pronunciations?.[0]?.ipa || '',
          });
        }
        cursor.continue();
      };
      req.onerror = () => resolve(list);
    });

    // Reverse Vietnamese -> English scan when no exact English match or Vietnamese characters present
    const hasVietnameseChars = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(q);
    let reverseMatches: OfflineDictLookupResult['reverseMatches'] = [];
    if (!exact || hasVietnameseChars) {
      reverseMatches = await new Promise<OfflineDictLookupResult['reverseMatches']>((resolve) => {
        const matches: OfflineDictLookupResult['reverseMatches'] = [];
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).openCursor();
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor || matches.length >= 15) {
            resolve(matches);
            return;
          }
          const val = cursor.value as OfflineDictEntry;
          const hit = val.definitions?.find((d) =>
            d.definition.toLowerCase().includes(q)
          );
          if (hit) {
            matches.push({
              word: val.word,
              definition: hit.definition,
              pos: hit.pos || '',
              posLabel: hit.posLabel || 'Từ vựng',
              ipa: val.pronunciations?.[0]?.ipa || '',
            });
          }
          cursor.continue();
        };
        req.onerror = () => resolve(matches);
      });
    }

    return {
      query: rawQuery.trim(),
      exact,
      related,
      reverseMatches,
      source: 'indexeddb',
    };
  } catch {
    return empty;
  }
}

export async function suggestFromBrowserCache(
  rawQuery: string,
  limit = 8
): Promise<Array<{ word: string; preview: string; ipa: string }>> {
  const q = rawQuery.trim().toLowerCase();
  if (!q || typeof indexedDB === 'undefined') return [];
  try {
    const db = await openDictDb();
    const upperBound = q.slice(0, -1) + String.fromCharCode(q.charCodeAt(q.length - 1) + 1);
    const range = IDBKeyRange.bound(q, upperBound, false, true);
    return await new Promise((resolve) => {
      const list: Array<{ word: string; preview: string; ipa: string }> = [];
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).openCursor(range);
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor || list.length >= limit) {
          resolve(list);
          return;
        }
        const val = cursor.value as OfflineDictEntry;
        list.push({
          word: val.word,
          preview: val.definitions?.[0]?.definition || '',
          ipa: val.pronunciations?.[0]?.ipa || '',
        });
        cursor.continue();
      };
      req.onerror = () => resolve(list);
    });
  } catch {
    return [];
  }
}
