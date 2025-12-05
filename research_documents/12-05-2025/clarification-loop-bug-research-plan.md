# Clarification Loop Bug Research Plan

Documented root-cause hypotheses and remediation steps for the runaway clarification requests observed in the background service worker console. Sources: `research_documents/codebase_architecture.yaml`, `research_documents/12-04-2025/ui_invalid_hook_research.yaml`, and the current background/side-panel implementation.

## Suspected Failure Modes

1. **Requirement Interpreter Lifecycle Drift**
   - `pendingRequirementSessions.set(taskId, …)` stores entries keyed by `taskId` while `submitAnswers` looks them up via `sessionId`. If keys diverge, the background never associates completed answers with their pending task, so `ensureProfile` keeps flagging clarifications.
   - `RequirementInterpreterService.ensureProfile` may be re-invoked repeatedly (e.g., executor retries, heartbeat-triggered resubmits) without checking whether a clarification request is already outstanding, spamming `sendClarification`.
   - Missing logging around `ensureProfile`, `submitAnswers`, and `sendClarification` prevents us from seeing when a session transitions from “needs clarification” to “complete”.

2. **Message-Port Handshake Timing**
   - `sendClarification` blindly posts to `currentPort`. If the side panel disconnects or has not yet attached a listener, the background immediately queues another clarification on the next ensure/submit cycle.
   - The side panel calls `chrome.runtime.connect` only when certain UI flows mount; a race could drop the first clarification payload, leading the interpreter to assume it was never delivered.

3. **Side Panel Auto-Submit Loop**
   - `autoSubmitClarificationAnswers` fires whenever cache entries cover every requested question. If trimmed values resolve to empty strings or stale answers, the background rejects them, re-requesting clarifications endlessly.
   - `hasMissing` detection might treat blank strings as “present,” causing the UI to submit invalid payloads repeatedly and never render the form.

4. **Payload ID Mismatch**
   - Background expects `message.sessionId` to match the interpreter’s `sessionId`, while the side panel might pass the UI’s `currentSessionId`. Any mismatch means `pendingRequirementSessions.get` returns `undefined`, so the interpreter keeps the session flagged as unresolved and resends questions.

## Proposed Remediation Steps

1. **Instrument & Align IDs**
   - Add structured logs around `ensureProfile`, `submitAnswers`, `sendClarification`, and `pendingRequirementSessions` mutations showing `(taskId, sessionId, requestCount)`.
   - Standardize on a single key (prefer `sessionId`) for `pendingRequirementSessions` and ensure `new_task` / `replay` store entries under that key.

2. **Port Reliability Enhancements**
   - Buffer clarification payloads if `currentPort` is `null` and flush when a new side-panel connection sends `heartbeat_ack`.
   - On the UI, establish the port connection before dispatching `new_task` to guarantee the listener is in place.
   - Track in-flight clarification session IDs to avoid re-posting the same payload if the UI has not acknowledged it yet.

3. **UI Cache Guardrails**
   - Harden `autoSubmitClarificationAnswers` to require non-empty trimmed values for every question before auto-submit, otherwise fall back to rendering the form.
   - Surface errors from `requirement_answers` responses in the UI so we know when the background rejects the payload instead of silently looping.

4. **Regression Coverage**
   - Extend requirement-interpreter unit tests with a mocked port to verify that exactly one `requirement_clarification` is emitted per unanswered question batch.
   - Add a React test (or Storybook scenario) that mounts `SidePanel`, injects a fake port, and ensures the clarification form appears once, auto-submit runs only with complete cached answers, and the cache clears after a successful response.

5. **Verification Plan**
   - After applying fixes, reproduce the scenario where clarifications previously looped and ensure logs show a single clarification request per task.
   - Run `pnpm -F chrome-extension test -- requirement-interpreter` (and new UI test) plus `pnpm -F pages/side-panel build` to confirm no regressions.
