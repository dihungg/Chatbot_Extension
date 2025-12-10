# TargetProductProfile Schema (Final Decision)

Based on the research in `research_documents/12-08-2025/simplification_research.md`, we have adopted the **Raw Context Accumulation** model.

This schema prioritizes **Hard Constraints** for strict filtering while preserving **Soft Constraints** as raw text context for the LLM agents to interpret.

---

## 1. Schema Definition

```typescript
/**
 * Hard constraints are extracted deterministically (Regex/List matching).
 * These are used for strict database/API filters if available.
 */
export type ProductType = 'laptop' | 'phone' | 'headphones' | 'other';

export type BudgetVnd = 
  | number 
  | { min: number; max: number };

export interface TargetProductProfile {
  // --- Hard Constraints ---
  product_type: ProductType;
  
  /**
   * Extracted numeric budget.
   * - Single number: "around X" or "max X"
   * - Range: "from X to Y"
   */
  budget_vnd: BudgetVnd | null;

  /**
   * Brands explicitly mentioned by the user.
   * Extracted via string matching against a known list of brands.
   */
  pref_brands: string[];
  
  /**
   * Brands explicitly excluded by the user ("không thích Samsung", "trừ Apple ra").
   */
  avoid_brands: string[];

  // --- Soft Constraints (Raw Context) ---

  /**
   * A chronological log of user inputs and requirements.
   * This preserves the exact phrasing, nuance, and intent of the user.
   * 
   * Example:
   * [
   *   "Tìm laptop cho sinh viên kiến trúc, tầm 20 triệu",
   *   "Cần màn hình đẹp để render màu chuẩn",
   *   "Không quá nặng vì hay mang đi cafe"
   * ]
   */
  requirements_context: string[];

  // --- System State ---

  /**
   * Tracks which clarification topics the user has opted out of or finished.
   * Key: question topic (e.g., 'gpu_needs', 'battery_pref').
   * Value: true if we should stop asking about this.
   */
  clarification_opt_outs: Record<string, boolean>;

  /**
   * Optional developer/system notes.
   */
  notes?: string;
}
```

## 2. JSON Schema (for validation if needed)

```jsonc
{
  "$id": "TargetProductProfile",
  "title": "TargetProductProfile",
  "type": "object",
  "required": ["product_type", "budget_vnd", "pref_brands", "avoid_brands", "requirements_context"],
  "properties": {
    "product_type": {
      "type": "string",
      "enum": ["laptop", "phone", "headphones", "other"]
    },
    "budget_vnd": {
      "anyOf": [
        { "type": "integer", "minimum": 0 },
        { "type": "null" },
        {
          "type": "object",
          "required": ["min", "max"],
          "properties": {
            "min": { "type": "integer", "minimum": 0 },
            "max": { "type": "integer", "minimum": 0 }
          },
          "additionalProperties": false
        }
      ]
    },
    "pref_brands": {
      "type": "array",
      "items": { "type": "string" },
      "default": []
    },
    "avoid_brands": {
      "type": "array",
      "items": { "type": "string" },
      "default": []
    },
    "requirements_context": {
      "type": "array",
      "description": "Chronological list of raw user requirement strings.",
      "items": { "type": "string" },
      "default": []
    },
    "clarification_opt_outs": {
      "type": "object",
      "additionalProperties": { "type": "boolean" },
      "default": {}
    },
    "notes": { "type": "string" }
  },
  "additionalProperties": false
}
```

## 3. Why this structure?

1.  **Simplicity**: We remove the complex `category_profile` with dozens of boolean flags (`needs_graphics`, `anc`, `5g`) and numeric priorities (`portability_priority: 1-5`).
2.  **Accuracy**: We avoid the error-prone task of mapping Vietnamese natural language ("pin trâu", "pin cũng được", "pin yếu sinh lý") into rigid 1-5 scales using Regex.
3.  **Flexibility**: The `requirements_context` can hold any requirement, even ones we didn't foresee (e.g., "bàn phím gõ êm", "có đèn led RGB").
4.  **LLM-First**: The heavy lifting of understanding these requirements is deferred to the **Planner Agent**, which has the context and intelligence to interpret them correctly when deciding which products to pick or which filters to apply.