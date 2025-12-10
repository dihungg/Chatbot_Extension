## Plan: Fix three TypeScript compilation errors

These errors prevent the dev build from completing. The issues stem from a duplicate export collision, a type-narrowing problem with partial updates, and an incomplete type guard. All are blocking and need fixes before development can proceed.

### Steps

1. Resolve **ProductType export collision** in index.ts by renaming one `ProductType` export (e.g., `TargetProductType` vs `UnifiedProductType`) to eliminate ambiguity.

2. Fix **immutability.ts type mismatch** by adding an explicit type assertion to `updateImmutable()` return in immutability.ts line 86, guaranteeing `T` completeness.

3. Fix **typeGuards.ts type guard** by explicitly casting the predicate expression to `boolean` in typeGuards.ts line 54 to satisfy strict type guard requirements.

4. Audit imports of renamed `ProductType` exports across the codebase (especially in `clarification.ts` and `unifiedProduct.ts` consumers) and update references to use the new names.

5. Run `pnpm -F shared type-check` to validate fixes locally.

6. Run `pnpm dev` to confirm all `ready` tasks pass and dev build succeeds.

### Further Considerations

1. **ProductType naming strategy:** Should both versions coexist (separate names), or should they merge into a union type? This depends on whether they represent different domains or could be unified.

2. **Type assertion safety:** The `immutability.ts` fix uses assertion; document the assumption that all required properties of `T` are guaranteed by the reducer logic, or refactor the type signature.

3. **Type guard strictness:** The boolean cast is valid since all branches return boolean, but verify that the type narrowing behavior (especially for `AzureConfigLike`) is correct after casting.