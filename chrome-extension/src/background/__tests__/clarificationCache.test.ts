import { describe, expect, it } from 'vitest';
import {
  CLARIFICATION_CACHE_KEY,
  clearClarificationCacheFromStorage,
  loadClarificationCache,
  mergeClarificationAnswers,
  persistClarificationCacheToStorage,
  type ClarificationCacheStorage,
} from '@extension/shared/lib/utils/clarification-cache';

const createMockStorage = (): ClarificationCacheStorage & { peek: () => Record<string, string | null> } => {
  const store: Record<string, string> = {};
  return {
    getItem: (key: string) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    peek: () => ({ ...store }),
  };
};

describe('clarification cache helpers', () => {
  it('loads an empty cache when storage is blank or malformed', () => {
    const storage = createMockStorage();
    expect(loadClarificationCache(storage)).toEqual({});
  });

  it('persists and reloads values through the storage adapter', () => {
    const storage = createMockStorage();
    const cache = { foo: 'bar' };
    persistClarificationCacheToStorage(cache, storage);

    expect(storage.peek()[CLARIFICATION_CACHE_KEY]).toBe(JSON.stringify(cache));
    expect(loadClarificationCache(storage)).toEqual(cache);
  });

  it('merges trimmed answers and ignores blank values', () => {
    const storage = createMockStorage();
    const base = { keep: 'value' };
    persistClarificationCacheToStorage(base, storage);

    const { cache, changed } = mergeClarificationAnswers(base, {
      keep: ' value ',
      newAnswer: ' answer ',
      blank: '   ',
    });

    expect(changed).toBe(true);
    expect(cache).toEqual({
      keep: 'value',
      newAnswer: 'answer',
    });
  });

  it('clears persisted cache entries from storage', () => {
    const storage = createMockStorage();
    persistClarificationCacheToStorage({ foo: 'bar' }, storage);
    clearClarificationCacheFromStorage(storage);

    expect(storage.peek()[CLARIFICATION_CACHE_KEY]).toBeUndefined();
    expect(loadClarificationCache(storage)).toEqual({});
  });
});
