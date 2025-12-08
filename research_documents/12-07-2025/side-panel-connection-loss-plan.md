# Side Panel ↔ Background Connection Loss — Execution Plan

Date: 2025-12-07  
Author: Codex Agent

## Goal
Stop the `Error: No valid connection available` path for clarification and replay flows by hardening the side-panel ↔ background channel, surfacing state to the user, and preventing service-worker restarts from orphaning pending clarification sessions.

## Guiding Principles
- Follow `PRINCIPLES.md` (SOLID, DRY, SRP, Law of Demeter) with incremental refactors only where we touch code.
- Prioritize user-visible reliability during clarification submissions without regressing existing happy paths.
- Keep fixes localized (side panel + background storage) and avoid cross-workspace refactors unless required.

## High-Level Workstream Breakdown
1. **Self-healing connection layer (highest priority).**
2. **Connection awareness in the UI lifecycle.**
3. **State persistence & mismatch handling.**
4. **User feedback + telemetry.**
5. **Verification & rollout.**

## Detailed Execution Steps

### 1. Self-Healing Connection Layer
1.1 Extract a `ensureConnection()` helper inside `SidePanel.tsx` (or `useSidePanelConnection` if the file is refactored) that:
- Checks `portRef.current?.name === 'side-panel-connection'`.
- If invalid, awaits `setupConnection()` and rejects with a descriptive error if the reconnect fails (respecting async constraints in React).
1.2 Update `sendMessage()` to call `await ensureConnection()` before the guard, turning the helper into the single path that can throw `No valid connection available`.
1.3 Add localized retry (single attempt w/ exponential backoff not required yet) so short Chrome hiccups between heartbeat intervals are masked.
Deliverable: reliable `sendMessage()` that auto-reconnects before throwing.

### 2. Connection Awareness in the UI Lifecycle
2.1 Add a `visibilitychange` / `focus` listener (React `useEffect`) that calls `setupConnection()` when the panel tab becomes active.
2.2 Re-run `setupConnection()` during initial mount after `pendingClarification` loads (without triggering duplicate connects thanks to guard inside `setupConnection()`).
2.3 Ensure microphone upload, slash commands, and replay paths all re-use `ensureConnection()` so there is no drift.
Deliverable: panel reconnects after suspend/resume without user input.

### 3. State Persistence & Mismatch Handling
3.1 Background (chrome-extension/src/background/index.ts):
- Persist `pendingRequirementSessions` to `chrome.storage.session` (MV3 storage that survives restarts) whenever entries change.
- Restore them during worker boot before accepting new ports.
3.2 When the panel reconnects but submits clarifications for a task ID that no longer exists, return a structured error (`requirement_session_missing`) instead of silently logging.
3.3 Side panel listens for that error and renders guidance ("Session expired, resend full task").
Deliverable: Clarification flows survive soft restarts; mismatches gracefully recover instead of hanging.

### 4. User Feedback + Telemetry
4.1 Introduce `connectionLost` React state set by `port.onDisconnect` and cleared by successful `setupConnection()`.
4.2 Render a lightweight banner/toast near the composer explaining that the connection dropped and actions will retry automatically.
4.3 Log the disconnect reason (include `chrome.runtime.lastError?.message`) through the existing telemetry/logging pipeline so we can correlate field incidents.
Deliverable: Visible status plus better observability.

### 5. Verification & Rollout
5.1 **Unit tests (Vitest)** for:
- `ensureConnection()` logic (mock `chrome.runtime.connect`).
- Storage persistence/restore functions in the background worker.
5.2 **Manual scenarios** (document in QA checklist):
- Submit clarifications after letting the service worker terminate (chrome://extensions → service worker → Terminate).
- Close/reopen side panel before submitting answers.
- Trigger slash commands, microphone upload, and new task after background restart.
5.3 Run `pnpm -F chrome-extension lint`, `pnpm -F chrome-extension type-check`, and targeted tests before merge.
Deliverable: Verified behavior and regression coverage.

## Dependencies / Risks
- Requires write access to both `pages/side-panel` and `chrome-extension` workspaces.
- `chrome.storage.session` availability must be confirmed (Chrome 116+). If unsupported, fall back to `chrome.storage.local` guarded by feature detection.
- Need to ensure reconnect attempts do not violate Chrome messaging rate limits; limit to once per user action plus heartbeat.

## Success Criteria
- Clarification submissions never throw `No valid connection available`; instead they retry or surface actionable guidance.
- Background retains pending sessions across worker restarts for at least the browser session.
- Disconnection states are visible and captured in telemetry for future monitoring.

## Execution Status (2025-12-07)
- ✅ Workstreams 1–2 implemented in `pages/side-panel/src/SidePanel.tsx` (auto-reconnect helper, focus/visibility reconnect effect, heartbeat resiliency, and a user-facing loss banner with manual retry).
- ✅ Workstream 3 completed by persisting `pendingRequirementSessions` via `chrome-extension/src/background/index.ts` plus new shared helpers/tests in `chrome-extension/src/background/pendingSessionsUtils.ts` and `__tests__/pendingSessionsUtils.test.ts`.
- ✅ Workstream 4 covered by surfacing disconnect reasons in React state and relaying structured `requirement_session_missing` responses from the background.
- ✅ Workstream 5 partially automated via the new Vitest coverage for persistence helpers; additional runtime verification still requires manual MV3 testing because `chrome.runtime.connect` cannot be mocked reliably in this environment.
