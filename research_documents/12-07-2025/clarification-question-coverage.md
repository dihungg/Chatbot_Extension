# Clarification Question Coverage – Cross-Category Analysis

_Date: 2025-07-12_

This note generalizes the “phone priority loop” issue to similar question patterns in other product categories. File references use the current workspace paths.

## 1. Laptop Priority Question
- **Question definition:** `questionLibrary.ts` (`chrome-extension/src/background/agent/requirement-interpreter/questionLibrary.ts:82-134`)
  - `hasLaptopPriority` returns `true` only if _both_ `category_profile.portability_priority` **and** `category_profile.battery_priority` are truthy.
  - Clarification text asks users to pick between “hiệu năng, sự gọn nhẹ, hay thời lượng pin”.
- **Parser behavior:** `applyLaptopPriority` (`profileParser.ts:340-368`) sets whichever priority matches the keywords provided. If a user answers “thời lượng pin”, only `battery_priority` becomes `5`, leaving `portability_priority` undefined.
- **Result:** The interpreter repeatedly asks the same question even though the user provided a valid choice. This mirrors the “camera vs. pin” loop seen on phones.

## 2. Phone Priority Question (baseline issue)
- **Question definition:** `hasPhonePriorities` requires **all three** fields (`camera_priority`, `battery_priority`, `screen_priority`) before marking the question as answered.
- **Parser behavior:** `applyPhonePriority` sets each field independently and can legitimately capture a subset (e.g., “camera, pin”).
- **Result:** Clarification loops until every priority slot is filled, contradicting the UX copy (“camera, pin hay màn hình?”). This is the initially reported bug.

## 3. Headphones Isolation Question
- **Question definition:** `hasHeadphoneIsolation` insists that both `category_profile.anc` and `category_profile.sound_isolation` be defined (`questionLibrary.ts:67-72`).
- **Parser behavior:** `applyHeadphoneIsolation` (`profileParser.ts:379-401`, not shown) toggles ANC and sound isolation independently depending on user wording.
- **Result:** Answering “cần ANC” satisfies only `anc`, so the question is asked again even though the wording promises acceptance of either ANC **or** isolation preferences.

## 4. Headphones Style Question
- **Question definition:** `hasHeadphoneStyle` requires both `latency_sensitive` and `wireless` to be defined (`questionLibrary.ts:74-79`).
- **Parser behavior:** `applyHeadphoneStyle` sets each flag based on keywords such as “không dây” or “độ trễ thấp”. Single-choice answers leave the other flag undefined.
- **Result:** Users are asked the same “không dây, độ trễ thấp hay chất âm?” question repeatedly unless they mention multiple properties in one reply.

## 5. Risk Summary
All four questions share the same anti-pattern: a clarifying prompt that offers multiple independent options but a completion predicate that demands every associated field be populated. Any single-preference answer fails the predicate, generating back-to-back clarification requests and blocking the planner.

## 6. Recommended Fix Pattern
1. Update the `has…` helpers so they treat the question as answered when **at least one** relevant field is provided (or when the user explicitly rejects all options). This affects:
   - `hasLaptopPriority`
   - `hasPhonePriorities`
   - `hasHeadphoneIsolation`
   - `hasHeadphoneStyle`
2. Optionally, introduce follow-up micro questions for the missing properties if we truly need complete coverage, but do not re-ask the same multi-option prompt unless the user left it blank.
3. Mirror these expectations in unit tests under:
   - `chrome-extension/src/background/agent/requirement-interpreter/__tests__/service.test.ts`
   - `chrome-extension/src/background/agent/requirement-interpreter/__tests__/profileParser.test.ts`

This generalized finding ensures consistent clarification UX across all supported categories.
