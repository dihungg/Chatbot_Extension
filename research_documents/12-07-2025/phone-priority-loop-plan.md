# Phone Priority Clarification Loop – Remediation Plan

_Date: 2025-07-12_

## 1. Confirm Current Behavior
- Inspect `chrome-extension/src/background/agent/requirement-interpreter/questionLibrary.ts` (lines referencing `hasPhonePriorities`) to understand the completion criteria for the `phone_priority` question.
- Review `chrome-extension/src/background/agent/requirement-interpreter/profileParser.ts` (`applyPhonePriority`) to trace how user replies such as “camera, pin” manipulate `category_profile` fields.
- Reproduce the issue in `pages/side-panel/src/SidePanel.tsx` by submitting `"camera, pin"` and observing repeated `requirement_clarification` events from the background script.

## 2. Adjust Completion Criteria
- Update `hasPhonePriorities` in `questionLibrary.ts` so it returns `true` when at least one of `camera_priority`, `battery_priority`, or `screen_priority` is populated, instead of requiring all three (`chrome-extension/src/background/agent/requirement-interpreter/questionLibrary.ts`).
- Document reasoning in the same file (short comment) referencing the UX expectation that the “camera, pin, hay màn hình?” question accepts partial answers.

## 3. Guard Against Future Regressions
- Add/extend unit coverage in `chrome-extension/src/background/agent/requirement-interpreter/__tests__/service.test.ts` to include:
  - A session where `ensureProfile` receives an answer covering two priorities (e.g., camera + battery) and should **not** re-prompt.
  - A session with no priority hints to ensure the clarification flow is still triggered.
- Validate parser behavior with a direct test of `ProfileParser.applyPhonePriority` (if needed, create a new test file or extend existing coverage in `chrome-extension/src/background/agent/requirement-interpreter/__tests__/profileParser.test.ts`).

## 4. Manual Verification
- Run `pnpm -F chrome-extension test -- requirement-interpreter` to confirm automated coverage.
- Launch the side panel (`pnpm -F pages/side-panel dev`), provide inputs like “camera, pin” and “camera, pin, màn hình” to ensure:
  - Single clarification request after partial answer.
  - No repeated prompts once at least one priority is captured.

## 5. Principles Checklist
- Cross-check changes against `PRINCIPLES.md` (DRY, SRP, correctness) before submission.
- Note any trade-offs (if completion condition becomes less strict) in the PR summary for transparency.
