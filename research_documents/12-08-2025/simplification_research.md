# Research: Simplifying Preference Handling Logic

This document outlines a proposed simplification of the preference handling system, moving away from complex, granular scores and keyword extraction towards a **Raw Context Accumulation** approach.

## 1. Analysis of the Current System & Challenges

The previous designs (Variant 1, 2, 3) and even the "Bag of Preferences" proposal relied on **extracting specific meaning** from user text into structured fields (e.g., `needs_graphics: boolean`, `portability_priority: 5`, or `preferences: ['gaming', 'mỏng nhẹ']`).

**The Core Problem:**
Extracting nuanced constraints from Vietnamese text using rule-based logic (Regex, keyword matching) is extremely difficult and brittle due to the richness and variability of the language.
- *"Pin trâu"* vs *"Pin ổn"* vs *"Dùng lâu hết pin"* all mean good battery but with different intensities.
- *"Mỏng nhẹ"* vs *"Không quá nặng"* have different implications.
- Hard-coding these rules makes the system fragile and hard to maintain.

## 2. Proposed Solution: "Raw Context Accumulation"

We propose to **stop trying to interpret "soft" preferences** during the input gathering phase. Instead, we divide user requirements into two categories:

1.  **Hard Constraints (Structured):** strictly required for filtering (e.g., Budget, Brand, Product Type). These are relatively easy to extract via simple patterns (e.g., numbers for price, known brand lists).
2.  **Soft Constraints (Unstructured):** everything else (battery life, weight, screen quality, intended use). We **do not extract** these. We simply **accumulate the raw user input** as context.

### Simplified `TargetProductProfile`

The profile becomes a hybrid of structured filters and a chronological log of user requirements.

```typescript
interface TargetProductProfile {
  // --- Hard Constraints (Deterministic Extraction) ---
  product_type: 'laptop' | 'phone' | 'headphones' | 'other';
  budget_vnd: { min: number; max: number } | number | null;
  pref_brands: string[]; // Known list (Asus, Dell, Apple...)
  avoid_brands: string[];
  
  // --- Soft Constraints (Raw Context) ---
  // A chronological log of every relevant thing the user has said.
  // We do NOT parse "pin trâu" -> battery_priority: 5 here.
  // We just save: "mình cần máy pin trâu để đi học cả ngày"
  requirements_context: string[]; 

  clarification_opt_outs: Record<string, boolean>; // To avoid repeating questions
  notes?: string; 
}
```

### Example Workflow

**User Task:** "Cần laptop gaming mỏng nhẹ của ASUS, ngân sách khoảng 35 triệu."

1.  **Auto-Extraction:**
    - `product_type`: "laptop"
    - `budget_vnd`: 35,000,000
    - `pref_brands`: ["asus"]
    - `requirements_context`: `["Cần laptop gaming mỏng nhẹ của ASUS, ngân sách khoảng 35 triệu."]`

2.  **Clarification:**
    - The system asks: "Bạn có cần GPU rời không?"
    - User answers: "Cần GPU rời để chơi game FPS."
    - Update `requirements_context`: 
      ```json
      [
        "Cần laptop gaming mỏng nhẹ của ASUS, ngân sách khoảng 35 triệu.",
        "Cần GPU rời để chơi game FPS."
      ]
      ```
    - We *do not* set `needs_graphics = true`. We just save the text.

3.  **Final Usage (The "Planner"):**
    - The `Planner` (which uses a powerful LLM) receives the **entire** `requirements_context`.
    - The Planner's Prompt:
      > "User wants a Laptop. Budget ~35m VND. Preferred Brand: ASUS.
      > Context:
      > 1. 'Cần laptop gaming mỏng nhẹ của ASUS...'
      > 2. 'Cần GPU rời để chơi game FPS.'
      >
      > Based on this, create a search plan."
    - The Planner LLM understands "game FPS" implies high refresh rate and good GPU, and "mỏng nhẹ" implies checking weight. It decides which filters to click on the e-commerce site.

## 3. Advantages

1.  **Solves the Vietnamese Parsing Problem:** We no longer need to write Regex for every possible way to say "good screen" in Vietnamese. The LLM handles the understanding at the end.
2.  **Zero Information Loss:** By passing raw text, we preserve every nuance (tone, specific game titles, vague desires).
3.  **Extremely Simple Parser:** The `profileParser` only needs to find numbers (price) and match strings against a Brand list.
4.  **Robust:** If the user says something unexpected ("dùng cho người già mắt kém"), we don't drop it because we didn't have a `user_age` field. It just goes into the context and the Planner sees it.

## 4. Recommendation

Adopt the **Raw Context Accumulation** model. This aligns with the "Simplification" goal and leverages the system's ability to use LLMs for the heavy lifting (Planning/Reasoning) rather than fragile pre-processing code.