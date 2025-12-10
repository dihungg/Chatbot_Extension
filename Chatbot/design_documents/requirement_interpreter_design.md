# Requirement Interpreter Integration Design

This document explains how we will integrate the Vietnamese **Requirement Interpreter** into the Nanobrowser architecture. The design implements the **Raw Context Accumulation** model, minimizing rigid parsing rules in favor of passing rich context to the agents.

## 1. Module placement

`chrome-extension/src/background/agent/requirement-interpreter/`

- `service.ts`: Orchestrator. Manages the session and clarification loop.
- `profileParser.ts`: **Simplified**. Extracts only hard constraints (Budget, Brand) and appends raw text to `requirements_context`.
- `questionLibrary.ts`: Provides clarification questions. No longer maps answers to specific fields, just aims to elicit more details.
- `types.ts`: Internal types.

## 2. Core Logic

### A. ProfileParser Responsibilities

The `ProfileParser` is now a "lightweight" component.

1.  **Extract Hard Constraints:**
    - **Product Type:** Detects 'laptop', 'phone', 'tai nghe' keywords.
    - **Budget:** Regex for "X triệu", "X k", "tầm X".
    - **Brands:** Matches against a predefined list of brands (e.g., `['asus', 'dell', 'apple', ...]`).
2.  **Accumulate Context:**
    - Any input provided by the user (initial task or clarification answer) is appended to the `requirements_context` array in `TargetProductProfile`.
    - It does **not** try to interpret "mỏng nhẹ" or "gaming" into boolean flags.

### B. QuestionLibrary Logic

The `QuestionLibrary` defines "Topics" rather than "Field Fillers".

- **Goal:** If the `requirements_context` doesn't seem to contain info about a topic (e.g., "Intended Use"), ask about it.
- **Check:** Since we don't have structured fields like `use_case` to check if they are null, we might use a simple heuristic (e.g., "Does the context contain keywords related to usage?") OR simply ask the standard questions if the conversation is short.
- **Optimization:** We can still use a very cheap local check (Regex) to see if the user *mentioned* keywords like "game", "học", "văn phòng". If yes, we skip the "Use Case" question.

### C. The Service Flow (`ensureProfile`)

1.  **Input:** User Task ("Tìm laptop asus 20tr").
2.  **Parser:**
    - `product_type`: laptop
    - `budget`: 20m
    - `brand`: asus
    - `context`: ["Tìm laptop asus 20tr"]
3.  **Clarification Loop:**
    - Service checks: "Do we have enough context?"
    - Example: Check if `context` has keywords for "usage" (gaming, study, work). If not, ask Q1.
    - User answers: "Mình học đồ hoạ."
    - **Parser Update:**
        - `context`: ["Tìm laptop asus 20tr", "Mình học đồ hoạ."]
    - Service checks: "Do we know about special needs (battery/weight)?" If not, ask Q2.
    - User answers: "Cần nhẹ dưới 1.5kg."
    - **Parser Update:**
        - `context`: ["Tìm laptop asus 20tr", "Mình học đồ hoạ.", "Cần nhẹ dưới 1.5kg."]
4.  **Final Output:** Returns the `TargetProductProfile`.

## 3. Integration with Agents

### Planner Agent

The `Planner` is the primary consumer of this profile.

- **Prompt Injection:**
  The `PlannerPrompt` will be updated to include a section: **"Target Product Context"**.
  
  ```text
  TARGET PRODUCT PROFILE:
  - Type: Laptop
  - Budget: ~20,000,000 VND
  - Brands: Asus
  
  USER REQUIREMENTS LOG:
  1. "Tìm laptop asus 20tr"
  2. "Mình học đồ hoạ."
  3. "Cần nhẹ dưới 1.5kg."
  
  INSTRUCTION:
  Use the User Requirements Log to understand the specific needs (e.g., "đồ hoạ" implies need for good color accuracy/GPU, "nhẹ dưới 1.5kg" is a weight filter).
  ```

- **Execution:**
  The Planner LLM uses this context to generate the search plan (e.g., "Go to CellphoneS -> Laptop -> Filter Price 15-20m -> Filter Brand Asus -> Look for 'Ultrabook' or 'Graphic' categories").

## 4. Data Flow Summary

1.  **Side Panel**: Sends `new_task`.
2.  **BG Service**: Calls `RequirementInterpreterService`.
3.  **Interpreter**:
    - Extracts `Hard Constraints` (Regex).
    - Stores `Raw Text`.
    - Asks clarifications (if context seems thin).
4.  **Planner**: Receives the profile.
    - Uses `Hard Constraints` for explicit strict steps (if any).
    - Uses `Raw Text` to infer "Soft" filters and navigation decisions.

## 5. Benefits of this Design

- **Robustness**: We don't fail if the user uses slang we didn't regex for. The LLM will likely understand it.
- **Simplicity**: No complex `category_profile` state machine.
- **Maintainability**: Adding a new category (e.g., "Smartwatch") just requires a new Brand list and a few Question strings. No schema migration for new flags.