# TODO – Side Panel Clarification Cache Fix

- [x] Diagnose current hook misuse *(reference research_documents/codebase_architecture.yaml + ui_invalid_hook_research.yaml)*
  - [x] Inspect `pages/side-panel/src/SidePanel.tsx` to confirm `persistClarificationCache`, `updateClarificationCache`, `clearClarificationCache` still sit below `export default SidePanel`.
  - [x] Document every hook/state (`useCallback`, `clarificationCacheRef`, `setClarificationCacheVersion`, etc.) the helpers should capture so the redesign preserves the Side Panel State Model.
- [x] Refactor clarification cache helpers into component scope
  - [x] Move the helper implementations inside the `SidePanel` component (or wrap in a custom hook invoked from it) so hooks run under React’s dispatcher and share component refs/state.
  - [x] Keep localStorage persistence safe (guard JSON parsing/stringify, debounce if needed) and ensure helpers still satisfy the requirement clarification flows noted in the architecture doc.
- [x] Reconnect helpers to the clarification loop
  - [x] Rewire the updated helpers into existing effects/event handlers (clarification form submit, cache restore on mount, cleanup on unmount) so cache state flows consistently between UI and storage.
  - [x] Verify `clarificationCacheVersion` increments/persists correctly when the interpreter requests/receives clarifications.
- [x] Add regression coverage
  - [x] Introduce a lightweight test or Storybook scenario (added Vitest coverage in `chrome-extension/src/background/__tests__/clarificationCache.test.ts` exercising the shared cache helpers).
- [ ] Build & sanity check
  - [ ] Run `pnpm -F pages/side-panel build` to ensure the bundle no longer emits top-level hook calls. *(blocked: sandbox environment cannot find a Node runtime)*
  - [ ] Spot-check the dev build (if possible) to confirm the side panel renders without “Invalid hook call / Cannot read properties of null” errors. *(blocked until a local dev browser build can run)*
