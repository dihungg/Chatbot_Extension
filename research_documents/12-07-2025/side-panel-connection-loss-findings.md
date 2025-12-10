# Side Panel ↔ Background Connection Loss

Date: 2025-12-07  
Author: Codex Agent

## Problem Statement

Users occasionally see the side panel throw `Error: No valid connection available` right after clicking *Submit* on the clarification form or while trying to continue an in-progress session. The question is what can cause the panel to lose its port to the background service worker while a session is still active or paused waiting for clarifications.

This note describes how the connection is created, the exact guard that raises the error, and the concrete states in which the guard is triggered.

## Connection Lifecycle

1. **Port creation is lazy.** `setupConnection()` (pages/side-panel/src/SidePanel.tsx:403-518) only runs when one of four UI paths calls it:
   - `/replay` handling (SidePanel.tsx:602-632)
   - Slash commands such as `/state` or `/nohighlight` (SidePanel.tsx:635-670)
   - Normal user prompts (`handleSendMessage`, SidePanel.tsx:707-780)
   - Microphone transcription upload (SidePanel.tsx:1142-1156)
   There is **no automatic call on mount** or when the panel regains focus.

2. **Heartbeat maintenance.** After connecting, the panel stores the port in `portRef.current` and starts a 25-second interval that posts `{ type: 'heartbeat' }`. If the post throws, or if `portRef.current?.name !== 'side-panel-connection'`, `stopConnection()` executes (SidePanel.tsx:493-505).

3. **Disconnect handling.** The `port.onDisconnect` callback clears `portRef`, stops the heartbeat, and re-enables the UI (SidePanel.tsx:479-488). On the background side, `chrome.runtime.onConnect` tracks the most recent port in `currentPort`, handles messages, and cancels any running executor when the port disconnects (chrome-extension/src/background/index.ts:108-215, 352-371).

4. **Sending messages.** All high-stakes posts (new tasks, follow-ups, replay, clarification answers) must go through `sendMessage()` (SidePanel.tsx:521-536). The helper bails out with:
   ```ts
   if (portRef.current?.name !== 'side-panel-connection') {
     throw new Error('No valid connection available');
   }
   ```
   This is the only place where the user-facing error string comes from.

## When `portRef` Stops Being Valid

### 1. Background service worker restarts or rejects the connection

- Chrome terminates MV3 service workers whenever the extension updates, the browser idles, or an unhandled exception occurs. When that happens the port disconnects automatically, `portRef.current` becomes `null`, and the heartbeat interval is cleared (SidePanel.tsx:479-505). The next `sendMessage()` call trips the guard before the UI has a chance to reconnect.
- The background also rejects ports when `senderId !== chrome.runtime.id` or if `senderUrl` does not start with the packaged side panel URL (`chrome-extension/src/background/index.ts:108-131`). If Chrome reports a stale sender URL (e.g., because the panel reloads after an update), the worker immediately calls `port.disconnect()`, leaving the panel without a valid channel.

### 2. Heartbeat-induced shutdown

- `setupConnection()` posts a heartbeat every 25 seconds. Any exception inside `portRef.current.postMessage({ type: 'heartbeat' })` triggers `stopConnection()` (SidePanel.tsx:493-502). Typical causes:
  - The background reloaded between heartbeats, so the port handle is no longer accepted.
  - Chrome suspends messaging while the tab is backgrounded, producing `Unchecked runtime.lastError: The message port closed before a response was received`.
- Once `stopConnection()` runs, `portRef.current` remains `null` until some code calls `setupConnection()` again. Clarification submissions never do that, so the next attempt to send answers throws immediately.

### 3. UI paths that explicitly drop the port

- `handleNewChat()` and the generic error handler inside `handleSendMessage()` both call `stopConnection()` (SidePanel.tsx:772-819). That means a user can inadvertently close the port (for example, by hitting *New Chat*) while the interpreter still waits for answers. If the user then edits cached responses and hits *Submit*, the guard fires because no reconnection occurred.
- The cleanup effect that runs when the component unmounts or when the browser shuts down also invokes `stopConnection()` (SidePanel.tsx:1013-1028). Closing and reopening the side panel yields a new React tree, but no code path reconnects on mount, so the first action (often “submit clarifications”) encounters the invalid port.

### 4. Clarification flow never revalidates the connection

- The clarification UI uses `sendMessage()` in both manual and automatic submission paths (SidePanel.tsx:935-975), yet these functions assume the existing port is still live. There is no opportunistic call to `setupConnection()` or retry logic.
- `pendingClarification` can remain in state long after the connection dies because `port.onDisconnect` simply resets a couple of flags; it does **not** clear `pendingClarification`.
- Result: it is easy to reproduce the failure by letting Chrome suspend the background (close the laptop lid or leave the panel idle), then return and click *Submit* — the panel still shows the form, but `portRef.current` is `null`, so `sendMessage()` throws `No valid connection available` before any reconnection attempt happens.

### 5. Background still waiting, but the map is gone

- `pendingRequirementSessions` lives only in the service worker’s memory (chrome-extension/src/background/index.ts:144-176, 267-306). When the worker restarts, that map is emptied. Even if the panel successfully reconnects later, those answers no longer have a `pending` entry to resume.
- The current UI does not detect this mismatch. After a restart, the first `sendMessage()` can simultaneously throw (because the old port died) and, if retried after reconnection, the interpreter will log “Received requirement answers but no pending session found,” leaving the user stuck. This reinforces why the guard activates — without a live port, there is no way to recover the pending session.

## Impact on Waiting-for-Clarification Scenarios

1. User submits a new task → `setupConnection()` runs → background asks for clarifications via `requirement_clarification`.
2. User studies the questions for a while. During this idle time Chrome suspends or reloads the service worker, firing `port.onDisconnect`. The panel quietly sets `portRef.current = null` but keeps `pendingClarification` intact.
3. When the user finally hits *Submit*, `handleClarificationSubmit` calls `sendMessage()`, which immediately throws `Error: No valid connection available`. The payload never leaves the panel, so the background keeps waiting indefinitely.
4. Reloading the side panel does not bring back the pending session because the worker lost its in-memory state. Users either retry the task from scratch or remain blocked.

## Hardening Ideas (Next Steps)

1. **Auto-reconnect before sending.** Have `sendMessage()` call `setupConnection()` (and await `chrome.runtime.connect`) whenever `portRef.current` is falsy or has the wrong `name`. That makes the helper self-healing for clarifications and speech-to-text posts.
2. **Reconnect on visibility/focus.** Add a `useEffect` that runs `setupConnection()` whenever the panel becomes visible or gains focus, mirroring the existing settings refresh logic (SidePanel.tsx:86-121).
3. **Surface disconnection state.** When `port.onDisconnect` fires, set a dedicated `connectionLost` flag and render a banner telling the user to retry. Right now the UI stays interactive even though `sendMessage()` will always throw.
4. **Persist pending sessions.** Store `pendingRequirementSessions` in extension storage so a service worker restart does not orphan clarification requests. Even if the port reconnects later, the background will still know which taskId was waiting for answers.
5. **Telemetry.** Log the reason string from `chrome.runtime.lastError` when `port.onDisconnect` executes. Those errors (“Receiving end does not exist”, “Port closed before a response”) will help correlate real-world failures with the scenarios above.

## References

- Side panel connection logic: `pages/side-panel/src/SidePanel.tsx:391-536, 602-780, 935-976, 1013-1156`
- Background service worker connection handling: `chrome-extension/src/background/index.ts:108-371`
