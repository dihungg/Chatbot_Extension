# Implementation Plan: Separate Structured & Unstructured Brand Parsing

This plan details the code changes required to implement the strict separation of brand parsing logic, as defined in `research_documents/12-08-2025/split_brand_inputs_design.md`.

## Guardrails & Principles
- **KISS (Keep It Simple, Stupid):** The new logic for `applyBrands` must be a direct mapping. No heuristic guessing for structured inputs.
- **SRP (Single Responsibility):** 
  - `extractBrandsFromUnstructuredText`: Only for raw task string.
  - `parseStructuredBrandAnswer`: Only for JSON answers from the UI.
- **Reliability:** Trust the user's explicit input in split boxes. "Avoid" box content = Avoid list.

## 1. File: `chrome-extension/src/background/agent/requirement-interpreter/profileParser.ts`

### 1.1 Refactor Utility Functions (Move to top of file or keep as helpers)
- **Rename** `deriveBrandPreferencesFromText` to `extractBrandsFromUnstructuredText`.
- **Create** `cleanAndSplit(text: string): string[]`.
  - Logic: `.split(/[,/]| và | hoặc |\/|-/)`, trim, filter empty.
  - This is a "dumb" splitter, distinct from the "smart" regex extractor.

### 1.2 Add `parseStructuredBrandAnswer` Helper
```typescript
function parseStructuredBrandAnswer(answer: string): { pref: string; avoid: string } | null {
  if (!answer.trim().startsWith('{')) return null;
  try {
    const parsed = JSON.parse(answer);
    if (parsed && typeof parsed === 'object') {
      return {
        pref: typeof parsed.pref === 'string' ? parsed.pref : '',
        avoid: typeof parsed.avoid === 'string' ? parsed.avoid : '',
      };
    }
  } catch {
    return null;
  }
  return null;
}
```

### 1.3 Refactor `applyBrands` Method
- **Logic Change:**
  1. Call `parseStructuredBrandAnswer(answer)`.
  2. **IF** result is not null:
     - `pref_brands = cleanAndSplit(result.pref)`
     - `avoid_brands = cleanAndSplit(result.avoid)`
     - **DO NOT** call the heuristic extractors.
  3. **ELSE** (Fallback for legacy/unexpected inputs):
     - Call `extractBrandsFromUnstructuredText(answer)`.
     - `pref_brands = result.pref`
     - `avoid_brands = result.avoid`

### 1.4 Update `autoExtractFromTask` Method
- Ensure it uses `extractBrandsFromUnstructuredText` (the renamed heuristic function) to maintain current behavior for the initial task input.

### 1.5 Context Logging Update
- In `applyAnswer`, update the logging logic to match the new flow:
  ```typescript
  // Inside applyAnswer
  if (BRAND_QUESTION_IDS.has(questionId)) {
    const structured = parseStructuredBrandAnswer(answer);
    if (structured) {
       entry = `${questionText} -> Ưu tiên: ${structured.pref}, Tránh: ${structured.avoid}`;
    } else {
       entry = `${questionText} -> ${answer}`;
    }
  }
  ```

## 2. File: `pages/side-panel/src/components/ClarificationForm.tsx` (Verification Only)

- **Verification:** Check `ClarificationForm` to ensure it correctly constructs the JSON object:
  ```typescript
  // Expected behavior (no change needed if already correct, but verify):
  const jsonAnswer = JSON.stringify({ pref: prefValue, avoid: avoidValue });
  onSubmit({ [questionId]: jsonAnswer });
  ```
- *Note: If the code already does this, no changes needed. Just a verification step.*

## 3. Testing (Unit Tests)

### 3.1 File: `chrome-extension/src/background/agent/requirement-interpreter/__tests__/profileParser.test.ts`
- **Add Test Case:** "Strictly parses structured JSON without heuristics"
  - Input: `JSON.stringify({ pref: "Dell", avoid: "HP" })`
  - Expect: `pref_brands: ['dell']`, `avoid_brands: ['hp']`
- **Add Test Case:** "Handles conflict in structured input" (Edge case check, though strictly we just trust the box)
  - Input: `JSON.stringify({ pref: "Tránh Dell", avoid: "" })`
  - Expect: `pref_brands: ['tránh dell']` (or `['dell']` if we strip "tránh").
  - *Decision:* The `cleanAndSplit` should probably just split. If the user types "Tránh Dell" in "Preferred", that's user error, but our cleaner `parseBrandList` usually strips "tránh". We should stick to `parseBrandList`'s cleaning logic but applied *individually* to each box's content, NOT the heuristic split logic.
  - *Refinement:* Use `parseBrandList` (renamed/refactored as needed) as the `cleanAndSplit` function, effectively stripping keywords like "tránh" but treating the *rest* as the value for that specific list.

## 4. Execution Order
1.  Verify `ClarificationForm.tsx`.
2.  Modify `profileParser.ts`.
3.  Update/Add tests in `profileParser.test.ts`.
4.  Run tests to confirm.
