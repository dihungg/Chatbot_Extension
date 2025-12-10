# Side Panel `setupConnection` ReferenceError Research

_Last updated: 2025-07-12. All observations verified against `pages/side-panel/src/SidePanel.tsx` in the current workspace and the console trace shown in the prompt._

## Console Timeline (context vs. failures)
- `index.ts:29 [SecurityGuardrails] ...` and `index.ts:119 [background] background loaded` – normal boot logs from the background service worker.
- `analytics.ts:67 [Analytics] PostHog API key not configured, analytics disabled` (twice) – emitted when `VITE_POSTHOG_API_KEY` is missing; analytics are intentionally skipped and this is **not** related to the crash.
- **Actual blocker:** `SidePanel.tsx:229 Uncaught ReferenceError: Cannot access 'setupConnection' before initialization` fired repeatedly from the `<SidePanel>` component (also visible inside the minified bundle at `side-panel/assets/index-WZIr4uUC.js:30589:48`). React retries, then surfaces the same ReferenceError again.

## Verified Cause
### Temporal Dead Zone triggered by effect dependency evaluation
1. The visibility/focus effect is declared near the top of `SidePanel` (`pages/side-panel/src/SidePanel.tsx:201-229`). Its dependency list is `[checkModelConfiguration, loadGeneralSettings, setupConnection]` and the effect body also calls `void setupConnection()` whenever the panel becomes visible.
2. The `setupConnection` hook itself is defined much later in the file (`pages/side-panel/src/SidePanel.tsx:438-573`) via `const setupConnection = useCallback(async () => { ... }, [ ... ])`.
3. Because `setupConnection` is a `const`, it lives in a temporal dead zone until execution reaches its declaration. When React evaluates the earlier `useEffect` call, the dependency array expression `[checkModelConfiguration, loadGeneralSettings, setupConnection]` is executed immediately. The moment JavaScript tries to read `setupConnection` inside that array, it throws `ReferenceError: Cannot access 'setupConnection' before initialization`.
4. The ReferenceError occurs during the very first render pass, so React never commits the component tree, leaving the side panel blank and halting all downstream connection logic.

### Secondary impact after the crash
- No runtime port is opened (`setupConnection` handles `chrome.runtime.connect` and heartbeat scheduling).
- Any helpers that rely on `setupConnection` such as `ensureConnection`, `sendMessage`, `handleReplay`, or the “Retry” button never get a working port reference (`portRef.current` stays `null`).
- Clarification cache syncing, replay enablement, and session bookkeeping also remain in their initial states, so even if the UI survived, it would be stuck in a disconnected mode.

## Confirming the Diagnosis
- Reproduced locally by simply rendering `<SidePanel />`; the crash happens before any user interaction, matching the console trace provided.
- Grepping the compiled bundle shows the same pattern: the effect invocation is emitted before the `const setupConnection = ...` assignment, leading to the identical ReferenceError once the script loads.
- No other references to `setupConnection` appear above the declaration, so the TDZ violation in this effect is currently the sole trigger.

## Remediation Options
1. **Reorder declarations (preferred, lowest risk):** Move the `setupConnection` `useCallback` above the visibility/focus `useEffect`, ensuring the dependency array evaluates after `setupConnection` has been initialized.
2. **Convert to a hoisted function:** Replace `const setupConnection = useCallback(...)` with a standard `function setupConnectionRef() { ... }` wrapper or hoisted helper, removing the TDZ issue and exporting a memoized variant later if needed.
3. **Split the visibility guard:** Extract the visibility/focus logic into a helper hook that accepts `setupConnection` as a parameter (e.g., `useConnectionGuards({ setupConnection, checkModelConfiguration, loadGeneralSettings })`). This enforces dependency ordering at the call site and keeps the main component readable.

Any of these changes will clear the ReferenceError. After applying a fix, re-run `pnpm -F pages/side-panel dev` (or rebuild) and ensure:
- The side panel renders without crashing.
- Background connection is re-established when the panel gains focus or becomes visible.
- Heartbeat logs, replay availability, and clarification cache behavior match expectations.
