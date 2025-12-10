import type { ClarificationAnswerValue } from '../types/clarification';

export type ClarificationCache = Record<string, Record<string, ClarificationAnswerValue>>;

export const LEGACY_SESSION_CACHE_KEY = '__legacy__';

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
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const values = Object.values(parsed as Record<string, unknown>);
      if (values.every(value => typeof value === 'string')) {
        return {
          [LEGACY_SESSION_CACHE_KEY]: parsed as Record<string, string>,
        };
      }
      return parsed as ClarificationCache;
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

const normalizeAnswerValue = (value: ClarificationAnswerValue): ClarificationAnswerValue => {
  if (typeof value === 'string') {
    return value.trim();
  }
  return {
    pref: value.pref.trim(),
    avoid: value.avoid.trim(),
  };
};

const hasAnswerContent = (value: ClarificationAnswerValue): boolean => {
  if (typeof value === 'string') {
    return Boolean(value);
  }
  return Boolean(value.pref || value.avoid);
};

const answersAreEqual = (a: ClarificationAnswerValue | undefined, b: ClarificationAnswerValue): boolean => {
  if (typeof a !== typeof b) {
    return false;
  }
  if (typeof a === 'string' && typeof b === 'string') {
    return a === b;
  }
  if (typeof a === 'object' && typeof b === 'object' && a && b) {
    return a.pref === b.pref && a.avoid === b.avoid;
  }
  return false;
};

export const mergeClarificationAnswers = (
  current: ClarificationCache,
  sessionId: string,
  answers: Record<string, ClarificationAnswerValue>,
): { cache: ClarificationCache; changed: boolean } => {
  const key = sessionId || LEGACY_SESSION_CACHE_KEY;
  const bucket = { ...(current[key] ?? {}) };
  let changed = false;

  Object.entries(answers).forEach(([questionId, value]) => {
    const normalized = normalizeAnswerValue(value);
    if (!hasAnswerContent(normalized)) {
      return;
    }
    if (!answersAreEqual(bucket[questionId], normalized)) {
      bucket[questionId] = normalized;
      changed = true;
    }
  });

  if (!changed) {
    return { cache: current, changed };
  }

  return {
    cache: {
      ...current,
      [key]: bucket,
    },
    changed,
  };
};
