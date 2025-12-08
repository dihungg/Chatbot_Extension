# Design: Split Brand Preferences into Distinct Inputs

## 1. Context & Problem Statement

Currently, the `ProfileParser` logic attempts to handle brand preferences in two ways:
1.  **Auto-extraction:** Parsing a raw sentence like "Thích Dell nhưng ghét HP" using complex Regex (`deriveBrandPreferencesFromText`) or LLMs.
2.  **Clarification Answers:** When the user fills out the clarification form, the `brand_split` UI variant allows typing in two boxes ("Ưu tiên" and "Tránh").

**The Problem:**
While the UI supports splitting, the backend logic in `profileParser.ts` mixes these concerns. It currently has a fallback mechanism where if JSON parsing fails, it attempts to run the complex text analysis on the answer. This adds unnecessary complexity and fragility. If we strictly separate the inputs at the UI level, the backend parsing logic for **clarification answers** can be reduced to a simple mapping (Direct Mapping), removing the need for "guessing" (Heuristics) in that specific flow.

## 2. Proposed Solution

We will enforce a strict separation between **unstructured input** (Raw Task) and **structured input** (Clarification Answers).

### 2.1. UI Layer (`ClarificationForm.tsx`)
*   The form already supports `brand_split`.
*   We must ensure that when this variant is used, the output is **always** a structured JSON string: `JSON.stringify({ pref: "...", avoid: "..." })`.
*   There should be no ambiguity. The UI handles the separation, so the backend doesn't have to "parse" natural language.

### 2.2. Backend Layer (`ProfileParser.ts`)

We will refactor `ProfileParser` to have two distinct modes of brand extraction:

1.  **`extractBrandsFromTask(rawTask)` (For Step 1):**
    *   **Goal:** User types "Laptop Dell tránh HP".
    *   **Logic:** Keeps the existing Heuristic/Regex logic (`deriveBrandPreferencesFromText`) because the input is unstructured.

2.  **`parseBrandAnswer(answer)` (For Step 2 - Clarification):**
    *   **Goal:** User fills the split form. Input is `{"pref": "Dell", "avoid": "HP"}`.
    *   **Logic:**
        *   Try `JSON.parse`.
        *   If valid, map `pref` -> `pref_brands` and `avoid` -> `avoid_brands`.
        *   **Crucial Change:** *Remove* the fallback to `deriveBrandPreferencesFromText` for this specific path. If the form is split, we trust the split. We do not try to re-analyze the text inside "Preferred" to see if they wrote "Tránh HP" inside the "Preferred" box. We assume the UI guided them correctly.

### 2.3. Schema & Data Flow

**Current Flow:**
`UI (Two Boxes)` -> `JSON String` -> `ProfileParser` -> `parseSplitBrandAnswer` -> `deriveBrandPreferencesFromSplit` (Mixes JSON and Regex).

**New Flow:**
`UI (Two Boxes)` -> `JSON String` -> `ProfileParser` -> `JSON Parse` -> `Direct Assignment`.

## 3. Implementation Details

### Changes in `profileParser.ts`

1.  **Refactor `deriveBrandPreferencesFromText`**: Rename to `extractBrandsFromUnstructuredText` to clearly indicate its purpose (for raw tasks only).
2.  **Simplify `applyBrands`**:
    *   It should strictly look for the structured format first.
    *   It should **not** call `extractBrandsFromUnstructuredText` if the JSON structure is present.
    *   Split comma-separated values in the JSON fields (e.g. "Dell, Asus" -> `['dell', 'asus']`).

### Example Logic

```typescript
// Old Complex Logic
function applyBrands(...) {
  const { prefText, avoidText } = parseSplitBrandAnswer(answer);
  // This function tries to be too smart, mixing explicit text with regex guessing
  return deriveBrandPreferencesFromSplit(prefText, avoidText);
}

// New Simple Logic
function applyBrands(...) {
  const parsed = parseStructuredBrandAnswer(answer); // Returns { pref: string, avoid: string } | null
  
  if (parsed) {
    // KISS: Just split by comma/newline
    return {
      pref_brands: cleanAndSplit(parsed.pref),
      avoid_brands: cleanAndSplit(parsed.avoid)
    };
  }
  
  // Fallback ONLY if answer was not structured (shouldn't happen with brand_split UI)
  return extractBrandsFromUnstructuredText(answer);
}
```

## 4. Advantages

1.  **Reliability:** "Dell" in the "Avoid" box means Avoid. We don't risk a regex thinking "Tránh Dell" means avoid Dell if the user typed "Tôi muốn tránh Dell" in the Avoid box.
2.  **Simplicity:** Reduces code cyclomatic complexity.
3.  **Maintainability:** Clear separation between "Guessing what the user wants" (Task) and "Reading what the user explicitly filled" (Form).

## 5. Action Plan

1.  **Verify UI:** Ensure `ClarificationForm` sends clean JSON.
2.  **Refactor Parser:** Rewrite `applyBrands` to be "dumb and direct" for JSON inputs.
3.  **Clean Utils:** Move the regex logic to a dedicated helper strictly for `autoExtractFromTask`.
