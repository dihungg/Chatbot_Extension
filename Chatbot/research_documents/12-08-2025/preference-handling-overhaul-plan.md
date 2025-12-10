# Preference Handling Overhaul — Implementation Plan

_Date: 2025-12-08_

## Objectives
- Resolve the multi-category clarification loops documented on 2025-07-12 by loosening the predicates that mark preference/prioritization questions as answered.
- Capture brand likes vs. dislikes through separate UI inputs so the interpreter no longer has to infer sentiment from a single blob of text.
- Replace the current keyword heuristics for priority and preference extraction with an LLM-driven parser, per the new guardrail of “LLMs over hard-coded rules.”

## Key Findings From Current Code
1. `hasLaptopPriority`, `hasPhonePriorities`, `hasHeadphoneIsolation`, and `hasHeadphoneStyle` each demand **all** associated fields be filled (`chrome-extension/src/background/agent/requirement-interpreter/questionLibrary.ts:40-83`), contradicting the UX copy that only promises a single choice. This reproduces the loops described in `research_documents/12-07-2025/clarification-question-coverage.md`.
2. Brand capture relies on `deriveBrandPreferences()` and `parseBrandList()` (`profileParser.ts:97-140, 330-360`). The research note from 2025-12-05 shows four failure modes rooted in the current regex-based splitting.
3. `ClarificationForm` (`pages/side-panel/src/components/ClarificationForm.tsx`) renders one `textarea` per question, so users cannot separate preferred and avoided brands without inventing their own syntax. Answers are cached and posted as `Record<string, string>` (`SidePanel.tsx:998-1035`).
4. All other prioritization handlers (`applyLaptopPriority`, `applyPhonePriority`, `applyHeadphoneIsolation`, `applyHeadphoneStyle`, etc.) use `includesAny`/`scoreFromKeywords` heuristics, which the user explicitly wants replaced with LLM extraction.

## Action Plan

### 1. Loosen Completion Predicates (Backend)
- Update the `has…` helpers so they return `true` when at least one related field is populated or the user explicitly opted out (e.g., answer is “không quan trọng”). This aligns with `clarification-question-coverage.md` and prevents repeated prompts.
- Add lightweight helper(s) such as `hasAnyPriority(profile, keys: string[])` to keep the logic DRY and compliant with `PRINCIPLES.md`.
- Extend `questionLibrary` unit tests plus `RequirementInterpreterService` tests (`__tests__/service.test.ts`) to cover single-choice answers and ensure no regressions for empty responses.

### 2. Split Brand Inputs in the Side Panel (Frontend + Cache)
- Extend `ClarificationQuestion` with optional `uiVariant` metadata (e.g., `{ type: 'brand_split', fieldMap: ['pref_brands', 'avoid_brands'] }`). Default existing questions to a single textarea; brand questions opt into the split variant without altering the transport layer for other questions.
- Update `QuestionDefinition` entries for `*_brands` in `questionLibrary.ts` to include this metadata so the background explicitly requests the dual-input UI.
- Modify `ClarificationForm` to render two labeled textareas (“Thương hiệu ưu tiên”, “Thương hiệu muốn tránh”) when the variant is `brand_split`. Keep validation independent per box and pre-fill each from the cache.
- Adjust `SidePanel`’s `handleClarificationSubmit`, cache helpers, and `RequirementClarificationPayload` typing so answers for split inputs serialize as `{ pref: string; avoid: string }` (JSON.stringify before posting) while maintaining backward compatibility for legacy question entries.
- Ensure the prompt builder (`promptBuilder.ts:45-64`) and cache persistence continue to display brand lists cleanly after the split input ships.

### 3. Replace Keyword Heuristics With LLM Extraction
- Introduce a dedicated `PreferenceExtractionAgent` (new module under `chrome-extension/src/background/agent/requirement-interpreter/`) that wraps the existing LLM runner used by other agents. The agent receives: product type, raw question text, raw answer (or split brand answers), and emits structured preferences (e.g., `camera_priority: 5`, `avoid_brands: ['xiaomi']`).
- Wire `ProfileParser.applyAnswer` to call this agent for:
  - `*_priority` questions (laptop, phone)
  - Headphone isolation/style questions
  - Brand questions (to normalize & deduplicate even after UI split, still respecting direct inputs)
  - Any future “other preferences” that were previously hard-coded
- Keep a minimal fallback (e.g., the existing heuristics) behind a feature flag or as a circuit breaker if the LLM result is unavailable, but default path must be the LLM output per instructions.
- Update `autoExtractFromTask()` to optionally invoke the same extractor on the original user task, replacing ad-hoc keyword scans for uses cases and brands.
- Document the prompt template for the extractor (fields, allowed values, how to map “không” answers) to satisfy `PRINCIPLES.md` (“Simple but complete solutions”) and ease future audits.

### 4. Strengthen Parsing & Tests
- Replace `deriveBrandPreferences()` with a normalization layer that merges the dual-textarea inputs (when present) and falls back to improved tokenization otherwise. Include unit tests covering the four scenarios in `brand-preferences-analysis.md`.
- Add Vitest coverage for the new LLM extractor stub using mock completions so CI remains deterministic.
- Exercise the full clarification loop in `RequirementInterpreterService` tests to ensure: (a) single-priority answers finalize the question, (b) brand answers entered through split UI persist correctly, and (c) interpreter doesn’t regress into loops.
- On the UI side, add React Testing Library coverage (or Storybook interaction tests) to verify the split brand component writes both answers, syncs with `clarificationCacheRef`, and serializes correctly when resubmitting.

### 5. Rollout & Validation
- Behind a feature flag (e.g., `llmPreferenceExtraction=true`) to allow gradual rollout.
- Manual verification steps:
  1. `pnpm -F chrome-extension test` to run the interpreter suite.
  2. `pnpm -F pages/side-panel test` (or Storybook scenario) for the new form behavior.
  3. Live sanity checks in dev mode (`pnpm -F chrome-extension dev` + `pnpm -F pages/side-panel dev`), answering clarification questions with partial priorities and the new split brand UI.
- Log (under `__DEV__`) the raw clarification answer and the structured payload returned by the LLM extractor to aid QA, making sure logs omit sensitive data (per SECURITY.md).

## Open Questions & Follow-Ups
- Confirm which LLM provider/configuration the extractor should use and whether it shares quota with existing agents.
- Decide whether to migrate stored historical profiles to the new, more permissive schema or only apply the loosening to new sessions.
- Clarify if multi-category tasks should run the extractor per category in parallel or stay serial as today.

Once these steps are implemented, the interpreter will stop looping on single-choice answers, users can explicitly tell us which brands to prefer vs. avoid, and the brittle regex heuristics will be replaced by an LLM-first pipeline as requested.
