/**
 * Unit tests for immutability utilities
 * Tests shallow copy, updates, chains, and immutability guarantees
 */

import { describe, expect, it } from 'vitest';
import {
  shallowCopy,
  updateImmutable,
  reduceImmutable,
  mergeUpdatesImmutable,
  chain,
  ImmutableChain,
  deepFreeze,
} from '../immutability';

describe('Immutability', () => {
  interface Profile {
    budget: number;
    brands: string[];
    settings?: Record<string, any>;
  }

  describe('shallowCopy', () => {
    it('creates new object reference', () => {
      const original: Profile = { budget: 1000, brands: ['Apple'] };
      const copy = shallowCopy(original);

      expect(copy).not.toBe(original);
      expect(copy).toEqual(original);
    });

    it('preserves all properties', () => {
      const original: Profile = {
        budget: 1000,
        brands: ['Apple', 'Samsung'],
        settings: { theme: 'dark' },
      };
      const copy = shallowCopy(original);

      expect(copy.budget).toBe(1000);
      expect(copy.brands).toEqual(['Apple', 'Samsung']);
      expect(copy.settings).toEqual({ theme: 'dark' });
    });

    it('creates shallow copy for nested objects', () => {
      const original: Profile = {
        budget: 1000,
        brands: ['Apple'],
        settings: { theme: 'dark' },
      };
      const copy = shallowCopy(original);

      // Nested arrays/objects are references
      expect(copy.brands).toBe(original.brands);
      expect(copy.settings).toBe(original.settings);
    });

    it('does not mutate original when modifying copy', () => {
      const original: Profile = { budget: 1000, brands: ['Apple'] };
      const copy = shallowCopy(original);

      copy.budget = 2000;

      expect(original.budget).toBe(1000);
      expect(copy.budget).toBe(2000);
    });
  });

  describe('updateImmutable', () => {
    it('returns new object with updates', () => {
      const original: Profile = { budget: 1000, brands: ['Apple'] };
      const updated = updateImmutable(original, { budget: 2000 });

      expect(updated).not.toBe(original);
      expect(updated.budget).toBe(2000);
      expect(original.budget).toBe(1000);
    });

    it('merges partial updates', () => {
      const original: Profile = { budget: 1000, brands: ['Apple'] };
      const updated = updateImmutable(original, {
        budget: 2000,
        brands: ['Samsung'],
      });

      expect(updated).toEqual({ budget: 2000, brands: ['Samsung'] });
      expect(original).toEqual({ budget: 1000, brands: ['Apple'] });
    });

    it('preserves properties not in updates', () => {
      const original: Profile = {
        budget: 1000,
        brands: ['Apple'],
        settings: { theme: 'dark' },
      };
      const updated = updateImmutable(original, { budget: 2000 });

      expect(updated.brands).toEqual(['Apple']);
      expect(updated.settings).toEqual({ theme: 'dark' });
    });

    it('overwrites with undefined values', () => {
      const original: Profile = { budget: 1000, brands: ['Apple'] };
      const updated = updateImmutable(original, { settings: undefined });

      expect(updated.settings).toBeUndefined();
    });
  });

  describe('reduceImmutable', () => {
    it('applies reducer function immutably', () => {
      const original: Profile = { budget: 1000, brands: [] };
      const updated = reduceImmutable(original, acc => ({
        budget: acc.budget * 2,
        brands: [...acc.brands, 'Apple'],
      }));

      expect(updated.budget).toBe(2000);
      expect(updated.brands).toEqual(['Apple']);
      expect(original.budget).toBe(1000);
      expect(original.brands).toEqual([]);
    });

    it('receives copy in reducer, not original', () => {
      const original: Profile = { budget: 1000, brands: ['Apple'] };
      let receivedCopy: Profile | null = null;

      const updated = reduceImmutable(original, acc => {
        receivedCopy = acc;
        return { budget: 2000 };
      });

      expect(receivedCopy).not.toBe(original);
      expect(receivedCopy).toEqual({ budget: 1000, brands: ['Apple'] });
    });
  });

  describe('mergeUpdatesImmutable', () => {
    it('applies multiple updates sequentially', () => {
      const original: Profile = { budget: 1000, brands: [] };
      const updated = mergeUpdatesImmutable(original, [{ budget: 2000 }, { brands: ['Apple'] }, { budget: 1500 }]);

      expect(updated.budget).toBe(1500);
      expect(updated.brands).toEqual(['Apple']);
      expect(original.budget).toBe(1000);
    });

    it('handles empty updates array', () => {
      const original: Profile = { budget: 1000, brands: [] };
      const updated = mergeUpdatesImmutable(original, []);

      expect(updated).toEqual(original);
      expect(updated).not.toBe(original); // Still returns new instance
    });
  });

  describe('ImmutableChain', () => {
    it('chains multiple updates fluently', () => {
      const original: Profile = { budget: 1000, brands: [] };
      const updated = chain(original)
        .update({ budget: 2000 })
        .update({ brands: ['Apple'] })
        .done();

      expect(updated.budget).toBe(2000);
      expect(updated.brands).toEqual(['Apple']);
      expect(original).toEqual({ budget: 1000, brands: [] });
    });

    it('returns new object at each step', () => {
      const original: Profile = { budget: 1000, brands: [] };
      const c = chain(original);
      const step1 = c.update({ budget: 2000 }).done();
      const step2 = c.update({ brands: ['Apple'] }).done();

      expect(step1.budget).toBe(2000);
      expect(step1.brands).toEqual([]);
      expect(step2.budget).toBe(1000);
      expect(step2.brands).toEqual(['Apple']);
    });

    it('supports reduce method', () => {
      const original: Profile = { budget: 1000, brands: [] };
      const updated = chain(original)
        .reduce(acc => ({
          budget: acc.budget * 2,
        }))
        .done();

      expect(updated.budget).toBe(2000);
      expect(original.budget).toBe(1000);
    });

    it('chains reduce and update methods', () => {
      const original: Profile = { budget: 1000, brands: [] };
      const updated = chain(original)
        .reduce(acc => ({ budget: acc.budget * 2 }))
        .update({ brands: ['Apple'] })
        .done();

      expect(updated.budget).toBe(2000);
      expect(updated.brands).toEqual(['Apple']);
    });
  });

  describe('deepFreeze', () => {
    it('freezes object and properties', () => {
      const original = {
        budget: 1000,
        settings: { theme: 'dark' },
      };

      const frozen = deepFreeze({ ...original });

      expect(Object.isFrozen(frozen)).toBe(true);
      expect(Object.isFrozen(frozen.settings)).toBe(true);

      // Attempting to modify should fail silently in non-strict mode
      const beforeBudget = frozen.budget;
      (frozen as any).budget = 2000;
      expect(frozen.budget).toBe(beforeBudget);
    });

    it('returns same object reference', () => {
      const original: Profile = { budget: 1000, brands: [] };
      const frozen = deepFreeze(original);

      expect(frozen).toBe(original);
    });
  });

  describe('integration test: Profile mutations', () => {
    it('demonstrates immutable profile updates', () => {
      const profile: Profile = {
        budget: 20_000_000,
        brands: [],
      };

      // Simulate user answering clarification questions
      const withBudget = updateImmutable(profile, {
        budget: 18_000_000,
      });

      const withBrands = updateImmutable(withBudget, {
        brands: ['Apple', 'Samsung'],
      });

      // Original unchanged
      expect(profile.budget).toBe(20_000_000);
      expect(profile.brands).toEqual([]);

      // Each step preserved
      expect(withBudget.budget).toBe(18_000_000);
      expect(withBudget.brands).toEqual([]);

      expect(withBrands.budget).toBe(18_000_000);
      expect(withBrands.brands).toEqual(['Apple', 'Samsung']);
    });

    it('demonstrates chaining pattern for multiple updates', () => {
      const profile: Profile = { budget: 20_000_000, brands: [] };

      const finalProfile = chain(profile)
        .update({ budget: 18_000_000 })
        .update({ brands: ['Apple'] })
        .update({ settings: { color: 'black' } })
        .done();

      // Original completely unchanged
      expect(profile).toEqual({ budget: 20_000_000, brands: [] });

      // Final profile has all updates
      expect(finalProfile).toEqual({
        budget: 18_000_000,
        brands: ['Apple'],
        settings: { color: 'black' },
      });
    });
  });
});
