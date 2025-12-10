import { createStorage } from '../base/base';
import { StorageEnum } from '../base/enums';
import type { TargetProductProfile } from '@extension/shared';

type TargetProfileMap = Record<string, TargetProductProfile>;
// Like a Python dictionary with keys of type string and values of type TargetProductProfile

export interface TargetProductProfileRepository {
  get(sessionId: string): Promise<TargetProductProfile | null>;
  set(sessionId: string, profile: TargetProductProfile): Promise<void>;
  clear(sessionId: string): Promise<void>;
  clearAll(): Promise<void>;
}

const storage = createStorage<TargetProfileMap>('target-product-profiles', {}, { storageEnum: StorageEnum.Local });

export const targetProductProfileRepository: TargetProductProfileRepository = {
  async get(sessionId) {
    const profiles = (await storage.get()) ?? {};
    return profiles[sessionId] ?? null;
  },
  async set(sessionId, profile) {
    await storage.set(existing => ({
      ...(existing ?? {}),
      [sessionId]: profile,
    }));
  },
  async clear(sessionId) {
    await storage.set(existing => {
      const next = { ...(existing ?? {}) };
      delete next[sessionId];
      return next;
    });
  },
  async clearAll() {
    await storage.set({});
  },
};

export type { TargetProductProfile };
