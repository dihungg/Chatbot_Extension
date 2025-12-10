# Implementation Plan: Simplifying Preference Handling Logic

This plan outlines the steps to transition the `TargetProductProfile` system from a complex, granular extraction model to a "Raw Context Accumulation" model, as proposed in the research.

## Phase 1: Shared Types Refactoring

**Objective:** Simplify the `TargetProductProfile` interface to remove granular fields (`battery_priority`, `needs_graphics`, etc.) and introduce `requirements_context`.

### 1.1 Update `packages/shared/lib/types/targetProductProfile.ts`
- Remove:
  - `LaptopCategoryProfile`, `PhoneCategoryProfile`, `HeadphonesCategoryProfile`.
  - `TargetProductProfileV1`.
- Define new `TargetProductProfile` interface:
  ```typescript
  export interface TargetProductProfile {
    product_type: ProductType;
    budget_vnd: BudgetVnd | null;
    pref_brands: string[];
    avoid_brands: string[];
    // New field for raw user input history
    requirements_context: string[]; 
    clarification_opt_outs: Record<string, boolean>;
    notes?: string;
    // Removed: category_profile
  }
  ```

## Phase 2: Requirement Interpreter Logic Overhaul

**Objective:** Rewrite the parsing and extraction logic to stop trying to understand "soft" preferences and instead accumulate them as raw text.

### 2.1 Update `chrome-extension/src/background/agent/requirement-interpreter/profileParser.ts`
- **Method `createBaseProfile`**: Initialize `requirements_context: []`.
- **Method `autoExtractFromTask`**:
  - **Keep**: `budget_vnd` extraction (Regex/Number parsing).
  - **Keep**: `pref_brands` extraction (Keyword matching against known brands).
  - **New**: Push the entire `rawTask` string into `requirements_context`.
  - **Remove**: All logic related to extracting `battery_priority`, `needs_graphics`, etc.
- **Method `mergeOverrides`**:
  - Update to merge `requirements_context` arrays (deduplicating strings if necessary, or just appending).
- **Method `applyAnswers`**:
  - When a clarification answer is received:
    - If it's a Hard Constraint (e.g. "Budget is 20m"), update the structured field.
    - **Always**: Append the raw question + answer to `requirements_context` (e.g., "User said: I need a gaming laptop" or just the answer).
    - **Remove**: Logic that tries to map answers to specific priority fields.

### 2.2 Update `chrome-extension/src/background/agent/requirement-interpreter/questionLibrary.ts`
- **Review Questions**:
  - Keep generic questions like "Primary Use Case?".
  - Keep Hard Constraint questions (Budget, Brand).
  - Remove highly specific "priority" questions (Screen vs Battery) *unless* we keep them as generic "What is more important to you?" questions that just feed into context.
- **Update `getPendingQuestions`**:
  - **Simplify**: Only return questions if:
    - A **Hard Constraint** is missing (e.g. no budget).
    - A "Standard" clarification hasn't been asked yet (checked via `clarification_opt_outs` or a new `asked_questions` tracker if needed).
    - **Remove**: Checks for `profile.category_profile.battery_priority === undefined`.

### 2.3 Update `chrome-extension/src/background/agent/requirement-interpreter/service.ts`
- Ensure `ensureProfile` passes the initial `rawTask` correctly to the parser to be added to context.
- Ensure `submitAnswers` updates the context.

## Phase 3: Prompt Engineering Update

**Objective:** Ensure the Planner Agent receives the raw context so it can reason about it.

### 3.1 Update `chrome-extension/src/background/agent/prompts/targetProductDescriptionBuilder.ts`
- **Method `build`**:
  - Print Hard Constraints (Product Type, Budget, Brands).
  - **New section**: "Context & Requirements History":
    - Iterate through `profile.requirements_context` and print each item as a bullet point.
  - **Remove**: Calls to `describeLaptopRequirements`, `describePhonePreferences`, etc.

## Phase 4: Testing & Verification

### 4.1 Fix Unit Tests
- Update `chrome-extension/src/background/agent/requirement-interpreter/__tests__/*.test.ts`.
- Tests that checked for `battery_priority` extraction should now check that the input text exists in `requirements_context`.

### 4.2 Manual Verification
- Run the extension.
- Input a complex request (e.g., "Laptop gaming pin trâu dưới 30 triệu").
- Verify that `requirements_context` contains the full string.
- Verify that the Planner prompt receives this string.
- Verify that the Planner correctly interprets "pin trâu" (via LLM reasoning) to select appropriate filters (if applicable) or guide the search.

## Phase 5: Cleanup (Optional but Recommended)
- Remove unused types in `packages/shared`.
- Remove unused parsing regexes in `profileParser.ts`.

---
**Note on Principles:**
- **KISS**: We are drastically simplifying the code by removing fragile extraction logic.
- **SRP**: The `ProfileParser` now only focuses on structured data (Hard Constraints), delegating "understanding" to the Planner LLM.
- **DRY**: We avoid duplicating "understanding" logic in both Regex and LLM.
