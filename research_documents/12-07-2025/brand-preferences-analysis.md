# Brand Preference Parsing Risks

**Date:** 2025-12-05  
**Author:** Codex Agent  
**Status:** Open Issue / Needs Refactor  

---

## Overview

The requirement interpreter currently infers preferred (`pref_brands`) and avoided (`avoid_brands`) vendors via the helper `deriveBrandPreferences()` inside `chrome-extension/src/background/agent/requirement-interpreter/profileParser.ts`. The helper:

1. Splits the incoming Vietnamese answer on the first occurrence of `tránh|không thích|không muốn`.
2. Sends the prefix of that split through `parseBrandList()` → `pref_brands`.
3. Joins the suffix back into a single string, pushes it through `parseBrandList()` → `avoid_brands`.

While this covers basic answers (“Ưu tiên Samsung, tránh Xiaomi”), multiple production transcripts highlight logic gaps that produce inaccurate data downstream.

---

## Findings

### 1. Multiple Negative Markers in One Sentence

- **Input:** `Apple, Samsung nhưng không thích Xiaomi, tránh Huawei`
- **Expected:** `pref = [apple, samsung]`, `avoid = [xiaomi, huawei]`
- **Actual:** `pref = [apple, samsung]`, `avoid = [xiaomi, tránh huawei]`

`String.split()` stops at the first negative keyword (“không thích”). The subsequent `tránh` inside the “avoid” region is treated as part of the brand token instead of another delimiter. Result: “tránh huawei” enters the avoid array verbatim, breaking brand matching.

### 2. Negative Phrase at the Beginning

- **Input:** `Tránh Nokia, thích Samsung và Apple`
- **Expected:** `pref = [samsung, apple]`, `avoid = [nokia]`
- **Actual:** `pref = []`, `avoid = [nokia, thích samsung và apple]`

Because the string begins with “Tránh”, `parts[0]` becomes an empty string/whitespace. The entire remainder (“Nokia, thích Samsung và Apple”) goes to `avoid`. The positive brands never populate `pref_brands`, so later filtering thinks the user has no preferred vendors.

### 3. Brand Tokens Collide With Cleaning Rules

`parseBrandList()` aggressively removes keywords and punctuation:

```ts
.replace(/(hãng|brand|thương hiệu|ưu tiên|tránh|không thích)/gi, '')
.replace(/:+/g, ' ')
.replace(/[\.\?]/g, ' ')
```

- **Input:** `Thương hiệu B&O và Apple`
- **Expected:** `pref = [b&o, apple]`
- **Actual:** `pref = [b, o, apple]`

The ampersand/diacritics survive, but the removal of Vietnamese helper words turns `B&O` into `b o`. Subsequent splitting (`[,/]| và | hoặc |\/|-)` separates it into two brands. Similar failures occur for “Sony - PlayStation” or vendor names that contain context keywords (“Brandless” would lose “brand”).

### 4. Contextual Phrases Leak Into Brand Arrays

- **Input:** `Hãng ưu tiên: Sony. Các hãng khác: Samsung, LG.`
- **Expected:** `pref = [sony, samsung, lg]`, `avoid = []`
- **Actual:** `pref = [sony, các hãng khác, samsung, lg]`

After the first split (no negative keyword), the function treats the entire sentence as “preferred” and merely strips a few words. Phrases like “các hãng khác” remain intact and enter the brand list, polluting downstream prompts (“tránh các hãng khác” is nonsensical to an LLM).

---

## Impact

- Incorrect `avoid_brands` prevents planners from respecting user bans, so search/navigation agents waste steps evaluating blacklisted vendors.
- Injecting context phrases (“các hãng khác”) into `pref_brands` confuses prompt builders and produces less relevant recommendations.
- Lossy parsing undermines later deduplication because `tránh huawei` and `huawei` no longer match.

---

## Recommendations

1. **Use a Structured Parser:** Replace the manual `split`/`replace` pipeline with either:
   - A tiny grammar (e.g., using `moo`/`nearley`) tuned for “preferred vs avoid” semantics, or
   - A lightweight NER model (spaCy Vi, VnCoreNLP) to extract organization entities plus the sentiment (“thích” vs “không thích”).

2. **If Staying With Strings:**
   - Normalize negative markers first (`answer.replace(/(tránh|không thích|không muốn)/gi, '##NEG##')`) and split on `##NEG##` while preserving the boundary tokens for the avoid bucket.
   - Run `parseBrandList` on *each* comma-separated fragment rather than entire halves, so later markers can trigger additional splits.
   - Limit the cleaning regex to actual stopwords; do not strip `hãng` until after splitting, and never remove characters that might appear in legitimate names (e.g., `&`, `/`, `-`).
   - Add unit tests for the four scenarios above to guard against regressions.

3. **Telemetry:** Log both the raw answer and the parsed arrays (behind `__DEV__` or debug builds) so future anomalies surface quickly.

---

## Cross-References

- Implementation: `chrome-extension/src/background/agent/requirement-interpreter/profileParser.ts` (`parseBrandList`, `deriveBrandPreferences`, `applyBrands`).
- Downstream usage: `RequirementInterpreterService` merges these arrays before generating Planner prompts (`chrome-extension/src/background/agent/requirement-interpreter/service.ts`).

---

**Next Steps:** Align on the parsing strategy (NER vs. improved heuristics) and implement guarded test cases before modifying production flows.
