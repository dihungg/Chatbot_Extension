# TargetProductProfile Schema Variants

This document proposes **three alternative designs** for the `TargetProductProfile` structure, each with:

- A JSON Schema (conceptual, not yet wired into any runtime validator)
- Matching TypeScript types

You can choose one design, or merge ideas across them, before we implement it inside the extension.

---

## Variant 1 – Discriminated union with nested `category_profile`

**Summary**

- Single top-level object with:
  - Shared base fields (`product_type`, `budget_vnd`, `use_case`, `pref_brands`, `avoid_brands`, …)
  - A `category_profile` object that changes shape depending on `product_type`.
- This is a **discriminated union**:
  - `product_type` = `"laptop"` → laptop-specific flags and priorities
  - `product_type` = `"phone"` → phone-specific fields
  - `product_type` = `"headphones"` → headphone-specific fields
- Good when you want:
  - Strong typing per category
  - Clear separation between shared vs category-specific data

### JSON Schema (Variant 1)

```jsonc
{
  "$id": "TargetProductProfileV1",
  "title": "TargetProductProfileV1",
  "type": "object",
  "required": ["product_type", "budget_vnd", "use_case"],
  "properties": {
    "product_type": {
      "type": "string",
      "enum": ["laptop", "phone", "headphones", "other"]
    },
    "budget_vnd": {
      "description": "Either a single budget or a min/max range in VND.",
      "anyOf": [
        {
          "type": "integer",
          "minimum": 0
        },
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
    "use_case": {
      "type": "string",
      "description": "High-level usage description (in Vietnamese)."
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
    "notes": {
      "type": "string",
      "description": "Optional free-form notes from the interpreter."
    },
    "category_profile": {
      "type": "object",
      "description": "Category specific flags and preferences.",
      "additionalProperties": true
    }
  },
  "allOf": [
    {
      "if": {
        "properties": {
          "product_type": { "const": "laptop" }
        }
      },
      "then": {
        "properties": {
          "category_profile": {
            "type": "object",
            "properties": {
              "needs_graphics": { "type": "boolean" },
              "needs_gaming": { "type": "boolean" },
              "needs_ai": { "type": "boolean" },
              "needs_large_storage": { "type": "boolean" },
              "portability_priority": {
                "type": "integer",
                "minimum": 1,
                "maximum": 5
              },
              "battery_priority": {
                "type": "integer",
                "minimum": 1,
                "maximum": 5
              }
            },
            "additionalProperties": false
          }
        }
      }
    },
    {
      "if": {
        "properties": {
          "product_type": { "const": "phone" }
        }
      },
      "then": {
        "properties": {
          "category_profile": {
            "type": "object",
            "properties": {
              "camera_priority": {
                "type": "integer",
                "minimum": 1,
                "maximum": 5
              },
              "battery_priority": {
                "type": "integer",
                "minimum": 1,
                "maximum": 5
              },
              "screen_priority": {
                "type": "integer",
                "minimum": 1,
                "maximum": 5
              },
              "needs_5g": { "type": "boolean" }
            },
            "additionalProperties": false
          }
        }
      }
    },
    {
      "if": {
        "properties": {
          "product_type": { "const": "headphones" }
        }
      },
      "then": {
        "properties": {
          "category_profile": {
            "type": "object",
            "properties": {
              "anc": { "type": "boolean" },
              "sound_isolation": {
                "type": "integer",
                "minimum": 1,
                "maximum": 5
              },
              "latency_sensitive": { "type": "boolean" },
              "wireless": { "type": "boolean" }
            },
            "additionalProperties": false
          }
        }
      }
    }
  ],
  "additionalProperties": false
}
```

### TypeScript Types (Variant 1)

```ts
export type BudgetVnd =
  | number
  | {
      min: number;
      max: number;
    };

export type ProductType = 'laptop' | 'phone' | 'headphones' | 'other';

export interface BaseTargetProductProfile {
  product_type: ProductType;
  budget_vnd: BudgetVnd | null;
  use_case: string | null;
  pref_brands: string[];
  avoid_brands: string[];
  notes?: string;
}

export interface LaptopCategoryProfile {
  needs_graphics?: boolean;
  needs_gaming?: boolean;
  needs_ai?: boolean;
  needs_large_storage?: boolean;
  portability_priority?: 1 | 2 | 3 | 4 | 5;
  battery_priority?: 1 | 2 | 3 | 4 | 5;
}

export interface PhoneCategoryProfile {
  camera_priority?: 1 | 2 | 3 | 4 | 5;
  battery_priority?: 1 | 2 | 3 | 4 | 5;
  screen_priority?: 1 | 2 | 3 | 4 | 5;
  needs_5g?: boolean;
}

export interface HeadphonesCategoryProfile {
  anc?: boolean;
  sound_isolation?: 1 | 2 | 3 | 4 | 5;
  latency_sensitive?: boolean;
  wireless?: boolean;
}

export type TargetProductProfileV1 =
  | (BaseTargetProductProfile & {
      product_type: 'laptop';
      category_profile: LaptopCategoryProfile;
    })
  | (BaseTargetProductProfile & {
      product_type: 'phone';
      category_profile: PhoneCategoryProfile;
    })
  | (BaseTargetProductProfile & {
      product_type: 'headphones';
      category_profile: HeadphonesCategoryProfile;
    })
  | (BaseTargetProductProfile & {
      product_type: 'other';
      category_profile?: Record<string, unknown>;
    });
```

---

## Variant 2 – Flat schema with top-level category flags

**Summary**

- One flat object with:
  - Shared fields (same as Variant 1)
  - All category-specific flags on the **top level**, all optional.
- Simple to log, inspect, and index (no nested `category_profile`).
- Tradeoff: less strict typing per category; you need to know which flags are relevant for each `product_type`.

### JSON Schema (Variant 2)

```jsonc
{
  "$id": "TargetProductProfileV2",
  "title": "TargetProductProfileV2",
  "type": "object",
  "required": ["product_type", "budget_vnd", "use_case"],
  "properties": {
    "product_type": {
      "type": "string",
      "enum": ["laptop", "phone", "headphones", "other"]
    },
    "budget_vnd": {
      "anyOf": [
        { "type": "integer", "minimum": 0 },
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
    "use_case": { "type": "string" },
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

    // Laptop-related flags
    "needs_graphics": { "type": "boolean" },
    "needs_gaming": { "type": "boolean" },
    "needs_ai": { "type": "boolean" },
    "needs_large_storage": { "type": "boolean" },
    "portability_priority": {
      "type": "integer",
      "minimum": 1,
      "maximum": 5
    },
    "battery_priority": {
      "type": "integer",
      "minimum": 1,
      "maximum": 5
    },

    // Phone-related flags
    "camera_priority": {
      "type": "integer",
      "minimum": 1,
      "maximum": 5
    },
    "screen_priority": {
      "type": "integer",
      "minimum": 1,
      "maximum": 5
    },
    "needs_5g": { "type": "boolean" },

    // Headphone-related flags
    "anc": { "type": "boolean" },
    "sound_isolation": {
      "type": "integer",
      "minimum": 1,
      "maximum": 5
    },
    "latency_sensitive": { "type": "boolean" },
    "wireless": { "type": "boolean" }
  },
  "additionalProperties": false
}
```

### TypeScript Types (Variant 2)

```ts
export type BudgetVnd =
  | number
  | {
      min: number;
      max: number;
    };

export type ProductType = 'laptop' | 'phone' | 'headphones' | 'other';

export interface TargetProductProfileV2 {
  product_type: ProductType;
  budget_vnd: BudgetVnd | null;
  use_case: string | null;
  pref_brands: string[];
  avoid_brands: string[];

  // Laptop-related flags
  needs_graphics?: boolean;
  needs_gaming?: boolean;
  needs_ai?: boolean;
  needs_large_storage?: boolean;
  portability_priority?: 1 | 2 | 3 | 4 | 5;
  battery_priority?: 1 | 2 | 3 | 4 | 5;

  // Phone-related flags
  camera_priority?: 1 | 2 | 3 | 4 | 5;
  screen_priority?: 1 | 2 | 3 | 4 | 5;
  needs_5g?: boolean;

  // Headphone-related flags
  anc?: boolean;
  sound_isolation?: 1 | 2 | 3 | 4 | 5;
  latency_sensitive?: boolean;
  wireless?: boolean;
}
```

---

## Variant 3 – Core + generic `category` attributes

**Summary**

- Two main sections:
  - `core`: strictly typed, category-agnostic fields
  - `category`: a generic structure with:
    - `kind`: `"laptop" | "phone" | "headphones" | "other"`
    - `attributes`: flexible key–value map (`string | number | boolean`)
- This is the most **future-proof / extensible** design:
  - Easy to add new flags without changing the core schema
  - Good for logging and experimentation (you can try new attributes from prompts)
- Tradeoff: weaker static typing for category-specific attributes.

### JSON Schema (Variant 3)

```jsonc
{
  "$id": "TargetProductProfileV3",
  "title": "TargetProductProfileV3",
  "type": "object",
  "required": ["core", "category"],
  "properties": {
    "core": {
      "type": "object",
      "required": ["product_type", "budget_vnd", "use_case"],
      "properties": {
        "product_type": {
          "type": "string",
          "enum": ["laptop", "phone", "headphones", "other"]
        },
        "budget_vnd": {
          "anyOf": [
            { "type": "integer", "minimum": 0 },
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
        "use_case": { "type": "string" },
        "pref_brands": {
          "type": "array",
          "items": { "type": "string" },
          "default": []
        },
        "avoid_brands": {
          "type": "array",
          "items": { "type": "string" },
          "default": []
        }
      },
      "additionalProperties": false
    },
    "category": {
      "type": "object",
      "required": ["kind", "attributes"],
      "properties": {
        "kind": {
          "type": "string",
          "enum": ["laptop", "phone", "headphones", "other"]
        },
        "attributes": {
          "type": "object",
          "description": "Flexible category-specific key-value attributes.",
          "patternProperties": {
            "^[a-zA-Z0-9_]+$": {
              "anyOf": [
                { "type": "string" },
                { "type": "number" },
                { "type": "boolean" }
              ]
            }
          },
          "additionalProperties": false
        }
      },
      "additionalProperties": false
    },
    "version": {
      "type": "integer",
      "const": 3
    }
  },
  "additionalProperties": false
}
```

### TypeScript Types (Variant 3)

```ts
export type ProductType = 'laptop' | 'phone' | 'headphones' | 'other';

export type BudgetVnd =
  | number
  | {
      min: number;
      max: number;
    };

export interface TargetProductProfileCore {
  product_type: ProductType;
  budget_vnd: BudgetVnd | null;
  use_case: string | null;
  pref_brands: string[];
  avoid_brands: string[];
}

export type CategoryAttributeValue = string | number | boolean;

export interface CategoryAttributes {
  kind: ProductType;
  attributes: Record<string, CategoryAttributeValue>;
}

export interface TargetProductProfileV3 {
  version: 3;
  core: TargetProductProfileCore;
  category: CategoryAttributes;
}
```

---

## Quick comparison

- **Variant 1 (discriminated union + nested `category_profile`)**
  - ✅ Strong typing per category
  - ✅ Clean separation between shared and category-specific fields
  - ↔ Slightly more complex schema

- **Variant 2 (flat)**
  - ✅ Easiest to log/query (one flat object)
  - ✅ Simple to reason about
  - ❌ Category-specific flags are not grouped; more manual discipline needed

- **Variant 3 (core + generic category attributes)**
  - ✅ Most flexible and future-proof
  - ✅ Great for experimentation and incremental evolution
  - ❌ Weak static typing for category-specific fields; you rely more on conventions

Once you pick a preferred variant (or a hybrid), we can implement:

- The Requirement Interpreter output format
- The session storage wiring
- How this profile is embedded into Planner / Navigator prompts

---

## Base Prompt Template & Question Sets (Variant 1)

Because Variant 1 is the preferred schema, the Requirement Interpreter can be instructed to (1) infer the category, (2) ask only the missing high-level questions, (3) normalize answers into the discriminated-union JSON. Below is the suggested prompt and question library for the initial three categories.

### 1. Universal system prompt template

````text
System (fixed):
Bạn là Requirement Interpreter cho trợ lý mua sắm thiết bị số (laptop, điện thoại, tai nghe, và có thể mở rộng thêm). Nhiệm vụ:
1. Đọc yêu cầu tiếng Việt của người dùng, suy ra category quan trọng nhất.
2. Hỏi tối đa 3–5 câu ngắn gọn, HOÀN TOÀN bằng tiếng Việt, và chỉ hỏi những thông tin chưa rõ (ngân sách, mục đích sử dụng, thương hiệu ưu tiên/tránh, 1–2 ưu tiên mềm của category).
3. Tránh hỏi lại nếu user đã nói rõ. Không hỏi thông số phần cứng cụ thể (RAM/SSD/CPU/GPU, camera megapixel chi tiết, v.v.) trừ khi user đã đề cập.
4. Sủ dụng văn phong thân thiện, chuyên nghiệp, xưng hô bằng "bạn-mình" với người dùng.

Assistant flow:
- Bước 1: suy ra category.
- Bước 2: duyệt library câu hỏi tương ứng với category; bỏ qua câu đã được user trả lời.
- Bước 3: hỏi một lượt tối đa 3–5 câu, đánh số 1., 2., 3.
```

### 2. Question library (per category)

Each question marked with `*` is core (budget, use case, brand). "Optional priority" questions should be skipped when user already provided that priority.

#### Laptop

1. `Ngân sách dự kiến cho laptop này khoảng bao nhiêu (ví dụ: 15–20 triệu)?` *(budget)*
2. `Bạn chủ yếu dùng laptop để làm gì (học tập, văn phòng, lập trình, đồ họa, gaming, AI, v.v.)?` *(use case)*
3. `Có thương hiệu nào bạn muốn ưu tiên hoặc tránh không?` *(brand preference/avoid)*
4. `Bạn ưu tiên hiệu năng, sự gọn nhẹ, hay thời lượng pin hơn?` *(portability vs performance)*
5. `Bạn có cần GPU rời hoặc cấu hình mạnh cho đồ họa/gaming/AI không?` *(needs_graphics / needs_ai / needs_gaming flags)*

#### Phone

1. `Ngân sách cho điện thoại bạn đang tìm là khoảng bao nhiêu (ví dụ: dưới 10 triệu, 10–15 triệu)?`
2. `Điện thoại sẽ dùng chủ yếu cho mục đích nào (chụp ảnh, quay vlog, làm việc, gaming, pin trâu, v.v.)?`
3. `Bạn có thương hiệu nào thích hoặc muốn tránh không?`
4. `Bạn ưu tiên điều gì hơn: camera, pin, hay màn hình?`
5. `Bạn có cần 5G hoặc tính năng đặc biệt (chống nước, sạc nhanh) không?`

#### Headphones

1. `Ngân sách cho tai nghe này khoảng bao nhiêu (ví dụ: dưới 3 triệu, 3–5 triệu)?`
2. `Bạn sẽ dùng tai nghe chủ yếu trong tình huống nào (làm việc văn phòng, di chuyển, chơi game, thu âm, nghe nhạc)?`
3. `Có thương hiệu nào bạn thích hoặc muốn tránh không?`
4. `Bạn có cần chống ồn chủ động (ANC) hoặc khả năng cách âm tốt không?`
5. `Bạn ưu tiên tai nghe không dây, độ trễ thấp cho chơi game, hay chất âm nhạc tính hơn?`

### 3. Mapping answers → Variant‑1 schema fields

- `product_type`: inferred category (`'laptop' | 'phone' | 'headphones' | 'other'`).
- `budget_vnd`: if user provides a range ("15–20 triệu") → convert to `{ min: 15000000, max: 20000000 }`; if single value ("khoảng 18 triệu") → store as number.
- `use_case`: short Vietnamese phrase summarizing main purpose ("học online và làm văn phòng").
- `pref_brands` / `avoid_brands`: lists parsed from question 3; treat "không có" as empty array.
- `category_profile`: fill only relevant flags:
  - **Laptop**: `needs_graphics`, `needs_gaming`, `needs_ai`, `needs_large_storage` (set true if user mentioned >1TB / "cần lưu trữ nhiều"); `portability_priority` and `battery_priority` scored 1–5 from question 4.
  - **Phone**: `camera_priority`, `battery_priority`, `screen_priority` (map user’s choice to high priority=5, medium=3, low=1); `needs_5g` boolean from question 5.
  - **Headphones**: `anc`, `sound_isolation` (1–5), `latency_sensitive`, `wireless`.

This template + question bank = starting point for implementing the Requirement Interpreter that emits `TargetProductProfileV1`.
