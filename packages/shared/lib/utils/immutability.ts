/**
 * Immutability helpers following functional programming principles
 * Ensures data is not accidentally mutated during transformations
 */

/**
 * Creates a shallow copy suitable for domain objects
 * Uses spread syntax for one level
 *
 * For nested structures, this creates a new top-level object but
 * maintains references to nested objects. Suitable for most domain models.
 *
 * @param obj - Object to copy
 * @returns New shallow copy of object
 *
 * @example
 * const profile = { budget: 1000, brands: ['Apple'] };
 * const copy = shallowCopy(profile);
 * copy.budget = 2000; // original unchanged
 * copy.brands.push('Samsung'); // WARNING: both affected (reference copy)
 */
export function shallowCopy<T extends Record<string, any>>(obj: T): T {
  return { ...obj };
}

/**
 * Applies updates to an object immutably
 * Returns new object without mutating input
 *
 * @param original - Original object
 * @param updates - Partial updates to apply
 * @returns New object with updates applied
 *
 * @example
 * const profile = { budget: 1000, brands: ['Apple'] };
 * const updated = updateImmutable(profile, { budget: 2000 });
 * // profile unchanged, updated.budget = 2000
 */
export function updateImmutable<T extends Record<string, any>>(original: T, updates: Partial<T>): T {
  return { ...original, ...updates } as T;
}

/**
 * Applies a reducer function to an object immutably
 * Returns new object; original unchanged
 *
 * @param original - Original object
 * @param reducer - Function that computes updates
 * @returns New object with updates applied
 *
 * @example
 * const profile = { budget: 1000, brands: [] };
 * const updated = reduceImmutable(profile, (acc) => ({
 *   budget: acc.budget * 1.1,
 *   brands: [...acc.brands, 'Apple']
 * }));
 */
export function reduceImmutable<T extends Record<string, any>>(original: T, reducer: (acc: T) => Partial<T>): T {
  return updateImmutable(original, reducer(shallowCopy(original)));
}

/**
 * Merges multiple partial updates immutably
 *
 * @param original - Original object
 * @param updates - Array of partial updates to merge
 * @returns New object with all updates merged
 *
 * @example
 * const profile = { budget: 1000, brands: [], avoidBrands: [] };
 * const merged = mergeUpdatesImmutable(profile, [
 *   { budget: 2000 },
 *   { brands: ['Apple'] }
 * ]);
 */
export function mergeUpdatesImmutable<T extends Record<string, any>>(original: T, updates: Partial<T>[]): T {
  return updates.reduce((acc: T, update) => updateImmutable(acc, update) as T, original);
}

/**
 * Chains immutable updates without intermediate mutations
 * Useful for applying multiple updates in sequence
 *
 * @example
 * const updated = chain(profile)
 *   .update({ pref_brands: [...profile.pref_brands, 'Apple'] })
 *   .update({ budget_vnd: 1000000 })
 *   .done();
 */
export class ImmutableChain<T extends Record<string, any>> {
  private obj: T;

  constructor(obj: T) {
    this.obj = shallowCopy(obj);
  }

  /**
   * Apply partial updates to current object state
   */
  update(updates: Partial<T>): this {
    this.obj = updateImmutable(this.obj, updates);
    return this;
  }

  /**
   * Apply reducer function to current object state
   */
  reduce(reducer: (acc: T) => Partial<T>): this {
    this.obj = updateImmutable(this.obj, reducer(this.obj));
    return this;
  }

  /**
   * Get final result
   */
  done(): T {
    return this.obj;
  }
}

/**
 * Create an immutable chain for fluent updates
 *
 * @param obj - Object to start with
 * @returns ImmutableChain instance
 */
export function chain<T extends Record<string, any>>(obj: T): ImmutableChain<T> {
  return new ImmutableChain(obj);
}

/**
 * Deep freeze for development/testing
 * WARNING: Not for production due to performance cost
 *
 * @param obj - Object to freeze
 * @returns Frozen object
 */
export function deepFreeze<T extends Record<string, any>>(obj: T): T {
  Object.freeze(obj);

  Object.getOwnPropertyNames(obj).forEach(prop => {
    if (obj[prop] && typeof obj[prop] === 'object' && !Object.isFrozen(obj[prop])) {
      deepFreeze(obj[prop]);
    }
  });

  return obj;
}
