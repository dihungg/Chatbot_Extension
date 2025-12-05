# Clarification Loop Root-Cause Analysis

Date: 2025-12-05  
Author: Codex Agent

## Overview

Runaway clarification prompts were observed in the background service worker console during task start and replay flows. The loop manifests as repeated `requirement_clarification` messages without the task ever progressing to execution. This document captures the data flows, failure points, and remediation steps uncovered while tracing the interaction between the background interpreter (`chrome-extension/src/background`) and the side-panel UI (`pages/side-panel`).

## Data Flow Summary

1. **Task submission**  
   - UI calls `port.postMessage({ type: 'new_task', taskId, task, tabId })` in `pages/side-panel/src/SidePanel.tsx:643-707`.  
   - Background handles the message, invokes `requirementInterpreter.ensureProfile(taskId, task)` (`chrome-extension/src/background/index.ts:138-156`).

2. **Clarification request emission**  
   - If profile data is incomplete, `RequirementInterpreterService.ensureProfile` returns `needs_clarification` (`chrome-extension/src/background/agent/requirement-interpreter/service.ts:35-70`).  
   - Background registers the pending session as `pendingRequirementSessions.set(taskId, …)` (`chrome-extension/src/background/index.ts:145-151`) and pushes the request through `sendClarification` (`chrome-extension/src/background/index.ts:362-371`).

3. **Side-panel handling**  
   - `SidePanel.setupConnection` listens for `requirement_clarification` messages (`pages/side-panel/src/SidePanel.tsx:406-428`).  
   - For each question, the component looks up cached answers via `clarificationCacheRef` (`pages/side-panel/src/SidePanel.tsx:409-415`), populated by `packages/shared/lib/utils/clarification-cache.ts`.

4. **Auto submit vs. manual form**  
   - If every question ID has a non-empty cache entry, the panel bypasses the form and calls `autoSubmitClarificationAnswers` (`pages/side-panel/src/SidePanel.tsx:419-422, 925-949`).  
   - Otherwise it renders `<ClarificationForm />`, allowing the user to submit answers (`pages/side-panel/src/components/ClarificationForm.tsx`).

5. **Answer processing**  
   - Background receives `requirement_answers`, calls `RequirementInterpreterService.submitAnswers`, which updates the profile and rechecks pending questions (`chrome-extension/src/background/index.ts:267-297` and `chrome-extension/src/background/agent/requirement-interpreter/service.ts:72-102`).  
   - Questions remain pending until `QuestionLibrary.getPendingQuestions` sees all relevant profile fields populated (`chrome-extension/src/background/agent/requirement-interpreter/questionLibrary.ts:11-200`).

## Confirmed Root Causes

### 1. Auto-submit posts invalid cached payloads

- **Mechanics:** `autoSubmitClarificationAnswers` submits as soon as every cached value is non-empty (`pages/side-panel/src/SidePanel.tsx:419-422`). Cached strings are trimmed but never validated (`packages/shared/lib/utils/clarification-cache.ts:73-94`).
- **Interpreter behavior:** `ProfileParser.applyAnswers` ignores entries that cannot be parsed into concrete profile data (`chrome-extension/src/background/agent/requirement-interpreter/profileParser.ts:150-220`). For example, budget parsing (`parseBudget`) returns `null` unless it finds numeric content (`profileParser.ts:11-37`).
- **Loop formation:** Since the background sees zero progress, `QuestionLibrary.getPendingQuestions` continues returning the same set, `ensureProfile`/`submitAnswers` emit `needs_clarification`, and the side panel replays the same invalid cache instantly. No user-visible form appears, so the loop persists indefinitely.

### 2. Optional questions never stay optional

- **Interpreter contract:** All questions listed in `QUESTION_DEFINITIONS` are treated as required until the corresponding `shouldAsk` predicate returns `false` (`questionLibrary.ts:58-190`). “Optional” questions simply have `isCore: false` for UI labeling; the backend still re-asks until the profile fields are filled.
- **UI contract:** `<ClarificationForm />` uses the `isCore` flag to decide whether to set the `required` attribute on `<textarea>` (`pages/side-panel/src/components/ClarificationForm.tsx:63-99`). Non-core questions can be submitted blank.
- **Effect:** Blank optional responses are dropped by `applyAnswer` (they short-circuit on `if (!answer.trim()) continue;` in `profileParser.ts:150-156`). The interpreter keeps the question pending, so after submission the user is immediately prompted again, appearing as a clarification loop.

### 3. No acknowledgement or back-pressure on UI delivery

- `sendClarification` posts blindly to `currentPort` without tracking whether the side panel acknowledged the payload (`chrome-extension/src/background/index.ts:362-371`). If the port disconnects or the panel auto-submits stale data, the background will requeue the same session on the next heartbeat, exacerbating the loop. There is no deduplicated “in-flight session” tracking between `sendClarification` and `requirement_answers`.

## Recommended Next Steps

1. **Harden auto-submit validations**
   - Update `SidePanel.tsx:407-422` to treat blank strings and domain-invalid cached values (e.g., non-numeric budgets) as missing so the UI renders the form instead of auto-posting.  
   - Optionally persist per-field validation metadata with the cache so incorrect entries trigger a UI warning instead of a silent loop.

2. **Align optional question semantics**
   - Either (a) enforce `required` for every question that the interpreter currently treats as mandatory, or (b) relax the backend by allowing genuinely optional fields to remain unset. If the latter, update `questionLibrary.ts` and `ProfileParser` to skip re-asking optional IDs once the user explicitly submits an empty value.

3. **Add acknowledgement / dedupe**
   - Include a client acknowledgment step: after rendering a clarification form (manual or auto), have the UI send a `clarification_received` event so the background knows not to resend until answers arrive.  
   - Maintain a set of in-flight session IDs in the background (`pendingRequirementSessions`) to prevent re-sending the same payload while `requirement_answers` for that session is pending.

4. **Instrumentation**
   - Add structured logging around `ensureProfile`, `submitAnswers`, `sendClarification`, and UI auto-submit paths to capture `(taskId, sessionId, questions, cacheHit)` data. This will make it easier to detect future loops.

5. **Regression coverage**
   - Extend `chrome-extension/src/background/agent/requirement-interpreter/__tests__/service.test.ts` with scenarios where answers are ignored (e.g., blank strings) to ensure pending questions behave as expected.  
   - Add a UI test / Storybook story that simulates cached-but-invalid answers to verify the side panel surfaces the form instead of looping silently.

## References

- Background service worker: `chrome-extension/src/background/index.ts` (lines 120-340).  
- Interpreter service: `chrome-extension/src/background/agent/requirement-interpreter/service.ts`.  
- Profile parser: `chrome-extension/src/background/agent/requirement-interpreter/profileParser.ts`.  
- Question catalog: `chrome-extension/src/background/agent/requirement-interpreter/questionLibrary.ts`.  
- Side panel UI: `pages/side-panel/src/SidePanel.tsx` and `pages/side-panel/src/components/ClarificationForm.tsx`.  
- Clarification cache utilities: `packages/shared/lib/utils/clarification-cache.ts`.
