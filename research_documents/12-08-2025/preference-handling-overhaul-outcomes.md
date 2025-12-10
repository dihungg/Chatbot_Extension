# Preference Handling Overhaul — Outcomes

_Date: 2025-12-08 (same day as plan)_

This note captures the concrete changes that satisfy `preference-handling-overhaul-plan.md` and maps each deliverable to the relevant code.

## 1. Completion Predicates Unblocked

- `questionLibrary.ts` exposes `hasAnyPriority()` utilities plus explicit opt-out checks so laptop/phone/headphone clarifications now advance after any single field is answered or the user declines (`clarification_opt_outs` persisted on the profile). See updated assertions in `__tests__/questionLibrary.test.ts` and `__tests__/service.test.ts`.
- The interpreter service surfaces `requirement_session_missing` whenever cached answers arrive for an expired session; the side panel informs the user via `chat_clarification_sessionMissing`.

## 2. Split Brand Inputs + Cache Semantics

- `ClarificationQuestion.uiVariant` advertises `brand_split`. The side panel renders dual textareas, serializes `{ pref, avoid }`, and stores answers inside a session-scoped cache bucket (`clarification-cache.ts`). Auto-submit is now gated by a per-request signature to avoid double POSTs.
- Background brand parsing accepts either JSON `{ pref, avoid }` payloads or legacy strings, then normalizes them through the shared helper before merging into `pref_brands` / `avoid_brands`.

## 3. PreferenceExtractionAgent + Feature Flag

- `preferenceExtractionAgent.ts` wraps the interpreter LLM with `withStructuredOutput`, enumerating every priority/flag the plan listed. The agent feeds both clarification answers and raw tasks (identifier `task_brands`), replacing heuristic-only parsing.
- `ProfileParser` injects the agent via a provider callback and records opt-outs, brand normalization, and category-specific flags (ANC, GPU, 5G, etc.). When `llmPreferenceExtraction` is disabled in `generalSettings`, the interpreter automatically falls back to the legacy heuristics.
- The options UI exposes the feature flag (see General Settings) so QA can toggle the extractor without redeploying.

## 4. Testing & Validation

- Vitest suites now cover: opt-out handling, split-brand caching and serialization, question completion loosening, and extractor wiring (`preferenceExtractionAgent` unit).
- Local automated runs are blocked in this environment because `node` is unavailable (see CLI error log). The next dev who has Node installed should run:
  - `pnpm -F chrome-extension test`
  - `pnpm -F pages/side-panel test`

## 5. Follow-ups

- Monitor telemetry/logs while the feature flag stays on by default; disable via Options if any LLM regression surfaces.
- Decide whether to backfill historical clarification caches with split-brand structures or keep them as legacy strings until they expire naturally.
