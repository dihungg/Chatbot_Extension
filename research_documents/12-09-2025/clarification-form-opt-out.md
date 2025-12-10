# Clarification Form Opt-Out for Compare/Analyze Tasks

## Goal
- Ensure users who ask the assistant to **compare existing products** or **analyze information** are not forced through the shopping requirement clarification form.
- Preserve the existing clarification flow for true purchase-intent tasks so planners still receive structured requirements.

## Current Flow (Key Files)
- `chrome-extension/src/background/index.ts`: every `new_task`/`replay` message calls `RequirementInterpreterService.ensureProfile`. When that service returns `needs_clarification`, the background pushes a `requirement_clarification` payload to the side panel.
- `chrome-extension/src/background/agent/requirement-interpreter/service.ts`: builds or loads a `TargetProductProfile`, merges auto-extracted info (via `ProfileParser`), and uses `QuestionLibrary.getPendingQuestions` to decide whether clarification is needed.
- `chrome-extension/src/background/agent/requirement-interpreter/questionLibrary.ts`: holds all clarification question definitions plus the `getPendingQuestions` logic (core questions require `budget`, `pref_brands`, etc.).
- `packages/shared/lib/types/targetProductProfile.ts`: defines the profile structure that stores clarification answers and opt-outs.
- `packages/shared/lib/utils/clarification-cache.ts`, `pages/side-panel/src/SidePanel.tsx`, and `pages/side-panel/src/components/ClarificationForm.tsx`: implement the UI form, caching, and submission flow once the background requests clarification.

## Observations
- The very first entry inside `TargetProductProfile.requirements_context` is always the raw task (`ProfileParser.autoExtractFromTask` seeds it), so intent keywords can be detected without new data plumbing.
- Nothing in `Executor` currently consumes `targetProductProfile` beyond storing it on `AgentContext`. This means skipping clarification for comparison/analysis tasks has no behavioral side effects beyond UX.
- `QuestionLibrary` already respects `clarification_opt_outs` for every question, so any mechanism that pre-populates opt-outs will automatically skip the form.

## Proposed Implementation

1. **Detect comparison / analysis intent before generating questions**
   - Create a helper (e.g., `detectClarificationBypassIntent(rawTask: string, context?: string[])`) inside `chrome-extension/src/background/agent/requirement-interpreter/intentUtils.ts`.
   - Heuristics: case-insensitive keyword search for terms like `compare`, `comparison`, `so sánh`, `đối chiếu`, `analyze`, `analysis`, `đánh giá`, `phân tích`, `review`, `benchmark`. Favor whole-word / accent-insensitive matching to cut false positives.
   - Optionally, look for explicit SKU references (model numbers joined by “vs”, “vs.”, “hay”, “or”) to reinforce the signal.

2. **Bypass clarification inside the interpreter**
   - In `RequirementInterpreterService.ensureProfile`, after the base profile + auto extraction step (before calling `getPendingQuestions`), call the helper above. If it returns `true`:
     - Either short-circuit with `{ status: 'complete', profile: undefined }` (and let `startNewTask` tolerate a missing profile) **or**
     - Preferably, clone the merged profile and mark every question ID under the detected category as opted-out. This can be done by adding a `markAllQuestionsResolved(profile: TargetProductProfile, category: ProductType)` helper in `questionLibrary.ts` that iterates over `getQuestionsForCategory(category)` and writes `clarification_opt_outs[question.id] = true`.
     - Persist the bypassed profile via `repository.set(sessionId, profile)` exactly like the normal path so follow-up tasks never re-trigger clarifications.
   - Ensure the same logic triggers for `replay` requests (`ensureProfile` is called there too).

3. **Keep the side panel cache consistent**
   - No UI work is required: when the interpreter returns `status: 'complete'`, the side panel never renders `ClarificationForm`.
   - Still, consider clearing any stale cached answers for the session (`SidePanel.handleNewChat` already calls `clearClarificationCache` but add a note in code comments if additional cleanup is needed).

4. **Testing & validation**
   - Extend `chrome-extension/src/background/agent/requirement-interpreter/__tests__/service.test.ts` with cases like “compare iPhone 15 vs Galaxy S24” and “phân tích thông số 2 mẫu laptop” asserting that `ensureProfile` now returns `status: 'complete'`.
   - Add unit tests for the new intent helper covering both English and Vietnamese keywords plus negative cases (e.g., “compare prices to set budget” might still require clarifications).
   - If using the “mark all questions resolved” approach, add a test in `__tests__/questionLibrary.test.ts` that verifies no pending questions are returned once the helper flags every question ID.

## Trade-offs & Open Questions
- **Heuristic accuracy**: keyword matching can still misclassify (“compare best laptops under 15m” might still need a budget input). Consider limiting the bypass to queries that explicitly mention two+ models or verbs like “đánh giá”, “review”, “phân tích”.
- **Extensibility**: keep the keyword list centralized inside the new helper so Product can tweak behavior without touching multiple files.
- **Optional UX hint**: we might later show a toast describing why the form was skipped; for now, the behavior is transparent.

## Implementation Checklist
1. Add `intentUtils.ts` (or similar) under `chrome-extension/src/background/agent/requirement-interpreter/`.
2. Import and call the helper from `RequirementInterpreterService.ensureProfile`.
3. Implement `markAllQuestionsResolved` in `questionLibrary.ts` (or expose the question IDs so `ProfileParser` can populate `clarification_opt_outs`).
4. Update unit tests plus any fixtures under `chrome-extension/src/background/agent/requirement-interpreter/__tests__`.
5. (Optional) Document the behavior in `design_documents` or the README once shipped.
