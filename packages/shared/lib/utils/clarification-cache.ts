export type ClarificationCache = Record<string, string>;

export interface ClarificationCacheStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

export const CLARIFICATION_CACHE_KEY = 'nanobrowser_requirement_answers';

const resolveStorage = (storage?: ClarificationCacheStorage): ClarificationCacheStorage | undefined => {
  if (storage) {
    return storage;
  }
  if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
    const { localStorage } = globalThis as typeof globalThis & { localStorage?: ClarificationCacheStorage };
    if (localStorage) {
      return localStorage;
    }
  }
  return undefined;
};

export const loadClarificationCache = (storage?: ClarificationCacheStorage): ClarificationCache => {
  const resolved = resolveStorage(storage);
  if (!resolved) {
    return {};
  }

  try {
    const raw = resolved.getItem(CLARIFICATION_CACHE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as ClarificationCache;
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch {
    // ignore malformed cache payloads
  }
  return {};
};

export const persistClarificationCacheToStorage = (
  cache: ClarificationCache,
  storage?: ClarificationCacheStorage,
): void => {
  const resolved = resolveStorage(storage);
  if (!resolved) {
    return;
  }

  try {
    resolved.setItem(CLARIFICATION_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore quota/security failures
  }
};

export const clearClarificationCacheFromStorage = (storage?: ClarificationCacheStorage): void => {
  const resolved = resolveStorage(storage);
  if (!resolved) {
    return;
  }
  try {
    resolved.removeItem(CLARIFICATION_CACHE_KEY);
  } catch {
    // ignore quota/security failures
  }
};

export const mergeClarificationAnswers = (
  current: ClarificationCache,
  answers: Record<string, string>,
): { cache: ClarificationCache; changed: boolean } => {
  const next = { ...current };
  let changed = false;

  Object.entries(answers).forEach(([key, value]) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    if (next[key] !== trimmed) {
      next[key] = trimmed;
      changed = true;
    }
  });

  return {
    cache: changed ? next : current,
    changed,
  };
};
