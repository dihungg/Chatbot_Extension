# Strategy: Optional Clarification & Smart Requirement Gathering

## Problem
Currently, the system forces a clarification loop even when the user provides a detailed prompt (e.g., "Find iPhone 16 Pro Max, long battery, waterproof"). Users find this redundant and annoying.

## Root Cause Analysis
1.  **`QuestionLibrary.ts`**: The `shouldAsk` logic is too simplistic. It only checks if the user has explicitly answered (or opted out of) a specific question ID. It does *not* inspect the accumulated `requirements_context` (the raw user input) to see if the information was already provided naturally.
2.  **`ProfileParser.ts`**: It attempts to auto-detect "Use Case" to skip the `use_case` question, but:
    *   It only handles the `use_case` topic.
    *   It modifies `clarification_opt_outs` directly, which slightly couples parsing with question logic.
    *   It misses other topics like `priority`, `features`, `power`, etc.

## Proposed Solution
We will shift the "Context Awareness" logic entirely into `QuestionLibrary.ts` and make it smarter.

### 1. Centralize Keyword Logic in `QuestionLibrary`
We will define keyword sets for each question topic (Use Case, Priority, Features, Power, etc.) within `QuestionLibrary.ts`.

### 2. Implement `hasContextKeywords` Helper
A helper function in `QuestionLibrary` will check if the accumulated `requirements_context` contains any keywords from a given set.

```typescript
const hasContextKeywords = (profile: TargetProductProfile, keywords: string[]): boolean => {
  const context = profile.requirements_context.join(' ').toLowerCase();
  return keywords.some(kw => context.includes(kw));
};
```

### 3. Update `shouldAsk` Predicates
We will update `QUESTION_DEFINITIONS` to use this helper.

**Example Transformation:**

*Before:*
```typescript
shouldAsk: profile => !hasOptedOut(profile, 'laptop_priority')
```

*After:*
```typescript
const PRIORITY_KEYWORDS = ['pin', 'battery', 'hiệu năng', 'performance', 'nhẹ', 'lightweight', 'màn hình', 'screen'];

shouldAsk: profile => 
  !hasOptedOut(profile, 'laptop_priority') && 
  !hasContextKeywords(profile, PRIORITY_KEYWORDS)
```

### 4. Clean up `ProfileParser`
Remove the partial "Use Case" detection logic from `ProfileParser.ts`. `ProfileParser` should focus solely on extracting **Hard Constraints** (Budget, Brand) and formatting the context. It should not worry about which questions to skip; that is the domain of `QuestionLibrary`.

## Detailed Changes

### `chrome-extension/src/background/agent/requirement-interpreter/questionLibrary.ts`

-   **Add Keywords:**
    -   `USE_CASE_KEYWORDS`: (Migrated from ProfileParser) 'game', 'code', 'photo', 'study', etc.
    -   `PRIORITY_KEYWORDS`: 'pin', 'camera', 'màn hình', 'hiệu năng', 'nhẹ', 'bền', 'đẹp'.
    -   `FEATURE_KEYWORDS`: '5g', 'chống nước', 'sạc nhanh', 'touch', 'fold'.
    -   `POWER_KEYWORDS`: 'gpu', 'card', 'đồ hoạ', 'render', 'ai'.
    -   `ISOLATION_KEYWORDS`: 'chống ồn', 'anc', 'xuyên âm'.
    -   `STYLE_KEYWORDS`: 'không dây', 'wireless', 'true wireless', 'bluetooth', 'có dây'.

-   **Update Definitions:**
    -   `laptop_use_case`: Check `USE_CASE_KEYWORDS`.
    -   `laptop_priority`: Check `PRIORITY_KEYWORDS`.
    -   `laptop_power`: Check `POWER_KEYWORDS`.
    -   `phone_use_case`: Check `USE_CASE_KEYWORDS`.
    -   `phone_priority`: Check `PRIORITY_KEYWORDS`.
    -   `phone_features`: Check `FEATURE_KEYWORDS`.
    -   `headphones_use_case`: Check `USE_CASE_KEYWORDS`.
    -   `headphones_isolation`: Check `ISOLATION_KEYWORDS`.
    -   `headphones_style`: Check `STYLE_KEYWORDS`.

### `chrome-extension/src/background/agent/requirement-interpreter/profileParser.ts`

-   Remove `USE_CASE_KEYWORDS` constant.
-   Remove step 3 in `autoExtractFromTask` ("Auto-detect Use Case to skip questions").

## Benefits
-   **Adaptive:** The system respects user input. If they say "for gaming", we don't ask "What do you use it for?".
-   **Robust:** Works for any topic we define keywords for, not just Use Case.
-   **Clean Architecture:** `ProfileParser` extracts data; `QuestionLibrary` manages the conversation flow.
