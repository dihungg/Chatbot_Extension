# Clarification Flow Analysis

**Date:** December 8, 2025
**Objective:** Verify if user clarification information reaches the Planner agent and identify any disconnects.

## Executive Summary

The investigation revealed a **critical disconnect** in the user interface layer that prevents users from sending clarifications while an agent task is running. While the backend architecture supports receiving and processing follow-up messages, the frontend explicitly disables the input field and removes the send button during task execution.

## Detailed Findings

### 1. Backend Architecture (Functional)
The backend infrastructure correctly supports the flow of messages from the UI to the Planner:
*   **Path:** `SidePanel` (UI) -> `Background Script` (`follow_up_task` event) -> `Executor` (`addFollowUpTask`) -> `MessageManager` (`addNewTask`) -> `PlannerAgent`.
*   **Mechanism:** The `Executor` maintains the `MessageManager` which holds the conversation history. When the Planner runs (periodically), it reads the full history, which would include any new messages added via `addFollowUpTask`.

### 2. Frontend Blocking (Critical Issue)
The primary failure point is in the React components:
*   **`SidePanel.tsx`**: When a task starts (`ExecutionState.TASK_START`), it sets `setInputEnabled(false)`.
*   **`ChatInput.tsx`**: When `disabled` prop is true, the input textarea is disabled. Furthermore, when `showStopButton` is true (which is set during task execution), the "Send" button is completely replaced by the "Stop" button.
*   **Result:** The user is physically unable to type or send a clarification message while the agent is working. They must wait for the task to finish or fail, or stop it entirely.

### 3. Latency & Responsiveness (Secondary Issue)
Even if the UI were fixed, there are architectural latency issues:
*   **Planning Interval:** The `Executor` runs the Planner only every `planningInterval` steps (default: 3) or when navigation completes. A user clarification sent at step 1 might not be processed until step 3.
*   **No Interrupt:** The `Executor` loop does not have a mechanism to interrupt the current `Navigator` action or force an immediate re-plan when a new message arrives.
*   **Prompting:** `MessageManager.addNewTask` wraps all new user messages with a prompt declaring it a "NEW ultimate task". This is framed for sequential tasks, not mid-task corrections (e.g., "No, click the other one"), potentially confusing the agent into dropping the original goal.

## Recommendations

### Short Term (Fix the Disconnect)
1.  **Enable UI Input:** Modify `SidePanel.tsx` to keep `inputEnabled` true during task execution.
2.  **Restore Send Button:** Update `ChatInput.tsx` to display the Send button alongside the Stop button, or allow submitting via Enter even if the Stop button is shown.
3.  **Handle Active Task Messages:** In `SidePanel.tsx`, detect if a task is running and send new messages as `follow_up_task` (or a new `clarification` type) instead of `new_task`.

### Long Term (Improve Experience)
1.  **Immediate Re-planning:** Update `Executor` to check for new messages before every step, overriding the `planningInterval` if a new user message exists.
2.  **Specialized Clarification Type:** Create a `addClarification` method in `MessageManager` that inserts the user's message without the "NEW ultimate task" wrapper, allowing for more natural guidance.
