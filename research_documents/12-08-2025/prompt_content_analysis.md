# Prompt Content Analysis

**Date:** December 8, 2025
**Objective:** Verify if the Planner LLM receives all user information (text, context, attachments) in the prompt.

## Conclusion
**YES.** The current codebase ensures that **all user information** provided in the chat interface is fully preserved, formatted, and delivered to the Planner agent. There is no active summarization or truncation logic that removes user details.

## detailed Analysis

### 1. Data Pipeline
The flow of user information is as follows:
1.  **UI Layer (`SidePanel.tsx` & `ChatInput.tsx`):**
    *   Combines the user's typed message and any attached text files.
    *   Format: `[User Message]\n\n<nano_attached_files>[Attachment 1]...[Attachment N]</nano_attached_files>`.
    *   **Finding:** No data is lost here; files are appended to the text.

2.  **Transport (`background/index.ts` -> `Executor`):**
    *   The full string is passed to the background service worker.
    *   It is routed to `Executor.addFollowUpTask` (for running tasks) or used in the `Executor` constructor (for new tasks).

3.  **Message Processing (`MessageManager`):**
    *   **Splitting:** The `splitUserTextAndAttachments` utility separates the text from the files for formatting. It strictly parses text *before* the file tags as the user request. Since the UI always places text first, this is safe.
    *   **Formatting:**
        *   **User Text:** Wrapped in `<nano_user_request>` tags.
        *   **Attachments:** Sanitized (to remove malicious content) and wrapped in `<nano_untrusted_content>` and `<nano_attached_files>` tags.
    *   **Finding:** The distinct separation ensures the LLM understands what is instruction vs. what is data.

4.  **Prompt Construction (`PlannerAgent`):**
    *   The `PlannerAgent` retrieves the full message history from `MessageManager`.
    *   It constructs the prompt using: `[System Prompt, User Task (with attachments), ...History]`.
    *   **Vision/Images:** If the planner does not use vision, images are stripped from the *browser state* updates, but this does not affect text-based user attachments.

### 2. Truncation & Limits
*   **Token Limiting:** The codebase contains a `cutMessages` method intended to trim history when it exceeds token limits (`maxInputTokens`).
*   **Status:** This method appears to be **unused** in the current execution flow.
*   **Implication:** The system attempts to send the **entire conversation history** to the LLM. While this guarantees no info is "summarized away" by the code, it means extremely long conversations might eventually hit the LLM provider's hard token limit (causing an error), rather than gracefully losing older context.

### 3. Edge Cases
*   **Security Sanitization:** The `guardrails` service runs on user input. This filters out potential prompt injection attacks or malicious HTML/JS. Legitimate user instructions are preserved.
*   **Attachment Parsing:** The parser ignores any text placed *after* the attachment block. Since the UI currently appends attachments at the very end, this is not an issue.

## Summary
The system is designed to be "lossless" regarding user intent. The prompts constructed for the Planner contain the exact text and file content provided by the user, wrapped in structural XML tags for clarity.
