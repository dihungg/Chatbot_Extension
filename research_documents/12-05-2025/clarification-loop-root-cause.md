# Clarification Loop Root-Cause Analysis

Date: 2025-12-05  
Author: Codex Agent

## Overview

Runaway clarification prompts still occur whenever a brand-new chat immediately falls back into the requirement questionnaire after the user completes the form. The loop shows up in the service worker logs as repeated `requirement_clarification` events with no executor progress. This update documents the full processing flow across `chrome-extension/src/background/**` and `pages/side-panel/**`, then drills into the four concrete failure modes now confirmed in code.

## Processing Flow (with file paths)

1. **New chat submission (`pages/side-panel/src/SidePanel.tsx:644-723`)**  
   `handleSendMessage` trims the user prompt, opens a fresh chat session via `chatHistoryStore.createSession`, saves the ID in `sessionIdRef`, and posts `{ type: 'new_task', taskId, task, tabId }` through `sendMessage`.

2. **Background intake (`chrome-extension/src/background/index.ts:125-190`)**  
   The `runtime.onConnect` handler receives `new_task`, validates `tabId`, and calls `requirementInterpreter.ensureProfile(taskId, task)` (service file `chrome-extension/src/background/agent/requirement-interpreter/service.ts:35-75`). The interpreter creates/loads a partial `TargetProductProfile`, infers product type, and computes `pendingQuestions = QuestionLibrary.getPendingQuestions(profile)` (`chrome-extension/src/background/agent/requirement-interpreter/questionLibrary.ts:11-205`).

3. **Clarification dispatch (`chrome-extension/src/background/index.ts:138-156, 362-371`)**  
   If `pendingQuestions.length > 0`, the background stores the task context in `pendingRequirementSessions` keyed by `taskId` and calls `sendClarification`, which broadcasts `{ type: 'requirement_clarification', payload }` over `currentPort`.

4. **Side panel reaction (`pages/side-panel/src/SidePanel.tsx:380-430`)**  
   `setupConnection` listens for `requirement_clarification`. For each question, it probes `clarificationCacheRef.current[question.id]` (initialized via `packages/shared/lib/utils/clarification-cache.ts`). If every entry contains a non-empty string, it immediately invokes `autoSubmitClarificationAnswers`; otherwise, it sets `pendingClarification` so that `<ClarificationForm />` renders (`pages/side-panel/src/components/ClarificationForm.tsx:65-101`).

5. **Answer submission (`pages/side-panel/src/SidePanel.tsx:896-949`)**  
   - Manual path: `handleClarificationSubmit` posts `{ type: 'requirement_answers', sessionId, answers }`, merges the answers into the cache via `updateClarificationCache`, and hides the form.  
   - Auto path: `autoSubmitClarificationAnswers` performs the same post without user UI and never touches the cache (because it already contained values).

6. **Interpreter re-evaluation (`chrome-extension/src/background/index.ts:267-297`)**  
   On `requirement_answers`, the background calls `RequirementInterpreterService.submitAnswers` (service.ts:77-107), which merges answers through `ProfileParser.applyAnswers` (`chrome-extension/src/background/agent/requirement-interpreter/profileParser.ts:154-248`), persists the updated profile, and re-runs `QuestionLibrary.getPendingQuestions`. If more questions remain, `sendClarification` fires again (Step&nbsp;3); otherwise, the task continues via `startNewTask` / `startReplayTask`.

Because the UI auto-submit path suppresses the form, the user never gets feedback when the interpreter ignores one or more answers: the same payload simply cycles through Steps 3–6 indefinitely.

## Confirmed Root Causes

### 1. Cached answers are never validated or reset
- `autoSubmitClarificationAnswers` fires whenever every `payload.question.id` resolves to a truthy string in `clarificationCacheRef` (`pages/side-panel/src/SidePanel.tsx:407-423`). Cache insertion simply trims strings (`packages/shared/lib/utils/clarification-cache.ts:73-94`) and `handleNewChat` never clears `clarificationCacheRef.current` (`pages/side-panel/src/SidePanel.tsx:756-770`), so stale answers are reused across sessions.
- `ProfileParser.applyAnswers` drops entries whose strings cannot be parsed into concrete values (`chrome-extension/src/background/agent/requirement-interpreter/profileParser.ts:154-198`). Budgets without digits or “ưu tiên linh hoạt” without expected keywords therefore leave the profile untouched.
- When a cached answer fails parsing, the interpreter reports zero progress, `QuestionLibrary.getPendingQuestions` returns the same IDs, and the UI immediately reposts the same bad payload without showing the form. The user perceives an infinite loop even on the very next chat because the cache was never cleaned.

### 2. Parser heuristics miss common Vietnamese phrasing
- `applyLaptopPriority` only searches for `'gọn'`, `'nhẹ'`, `'pin'`, `'hiệu năng'/'performance'` (`profileParser.ts:209-226`). Synonyms like “cơ động”, “thiết kế mỏng nhẹ”, or “cân bằng” never flip `category_profile.portability_priority` / `battery_priority`, so `hasLaptopPriority` (`questionLibrary.ts:17-22`) remains `false`.
- `applyLaptopPower` only toggles flags when the answer literally includes `'gpu'`, `'đồ hoạ'`, `'game'`, `'esport'`, or `'ai'` (`profileParser.ts:229-248`). Phrases such as “cần card rời”, “không chơi game”, or “chỉ làm văn phòng” are ignored because `boolFromAnswer` (`profileParser.ts:71-79`) does not look for those tokens.
- Similar gaps exist for phone/headphone priorities where only a handful of keywords update numeric priorities (`profileParser.ts:251-315`). When the parser ignores an answer, the same question ID stays pending, triggering endless clarification.

### 3. “Optional” UI semantics disagree with backend requirements
- Every entry in `QUESTION_DEFINITIONS` stays required until its `shouldAsk` predicate returns `false` (`questionLibrary.ts:58-190`). The `isCore` flag only affects UI labeling.
- `<ClarificationForm />` sets the HTML `required` attribute only for `question.isCore` (`pages/side-panel/src/components/ClarificationForm.tsx:65-82`), so users can submit empty strings for non-core prompts.
- `ProfileParser.applyAnswers` skips blank strings (`profileParser.ts:154-159`), meaning the interpreter sees zero progress and immediately re-sends the same question IDs.

### 4. Question chunking locks the loop to the first batch
- `QuestionLibrary.getPendingQuestions` slices results to `MAX_QUESTIONS = 5` (`questionLibrary.ts:11, 58-150`).
- When none of the first five answers survive parsing (Root Causes 1–3), later questions are never surfaced; the interpreter keeps asking for the same five fields.
- Because the UI auto-submit path never surfaces the form after the first pass, users cannot edit the problematic batch, so the loop persists even though new input might fix it.

## Recommended Next Steps

1. **Reset and validate the cache**  
   Clear `clarificationCacheRef` in `handleNewChat` and whenever a session completes, then perform lightweight validation (numeric budget, recognizable keywords) before auto-submit. Render the form whenever cached values fail validation.

2. **Broaden parser vocabularies**  
   Expand `ProfileParser` keyword maps (e.g., recognize “cơ động”, “card rời”, “không chơi game”, “ưu tiên chụp đêm”) and add interpreter unit tests covering the new phrases.

3. **Align “optional” UX with backend expectations**  
   Either mark every clarification field as required in the UI, or teach the backend to treat explicit empty submissions as opt-outs so `shouldAsk` can return `false`.

4. **Improve batching resiliency**  
   Track “asked count” per question ID and rotate to the next unanswered items when a batch yields no profile deltas, or render the form whenever the interpreter repeats the same question list twice.

5. **Instrumentation**  
   Emit structured logs for `(taskId, sessionId, questionIds, cacheHit, autoSubmit)` on both the UI (SidePanel.tsx) and background (`sendClarification`, `submitAnswers`) paths to spot loops quickly.

6. **Regression coverage**  
   Extend `chrome-extension/src/background/agent/requirement-interpreter/__tests__/service.test.ts` with blank/invalid-answer scenarios and add a UI test that preloads the clarification cache with malformed data to ensure the form re-renders instead of silently looping.

## References

- Background service worker: `chrome-extension/src/background/index.ts` (lines 120-420).  
- Interpreter service: `chrome-extension/src/background/agent/requirement-interpreter/service.ts`.  
- Profile parser: `chrome-extension/src/background/agent/requirement-interpreter/profileParser.ts`.  
- Question catalog: `chrome-extension/src/background/agent/requirement-interpreter/questionLibrary.ts`.  
- Side panel UI: `pages/side-panel/src/SidePanel.tsx` and `pages/side-panel/src/components/ClarificationForm.tsx`.  
- Clarification cache utilities: `packages/shared/lib/utils/clarification-cache.ts`.
