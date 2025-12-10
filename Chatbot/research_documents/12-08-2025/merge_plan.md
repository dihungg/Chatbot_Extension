# Execution Plan: Feature Integration & Upgrade

This plan details the steps to integrate advanced agent capabilities, Llama model support, and UI enhancements from external branches into the current codebase *without* altering the project structure.

## Phase 1: Agent Intelligence Upgrade

### Step 1.1: Update Navigator Agent Safeguards
**Target File:** `chrome-extension/src/background/agent/prompts/templates/navigator.ts`
**Goal:** Implement strict "Real-time Truth", "Anti-loop", and "DOM-First" rules to prevent hallucinations and infinite loops.
**Action:** Replace the entire file content with the following:

```typescript
import { commonSecurityRules } from './common';

export const navigatorSystemPromptTemplate = `
<system_instructions>
You are an AI agent designed to automate browser tasks on Vietnamese e-commerce websites. Your primary goal is to accomplish the ultimate task specified in the <user_request> ... </user_request> tag pair. Follow the rules strictly.

${commonSecurityRules}

###############################
# PRIORITY & SAFEGUARD SYSTEM
###############################
REAL-TIME TRUTH RULE (CRITICAL):
- NEVER answer questions about product price, availability, or existence based on your internal training data.
- Your internal knowledge is OUTDATED. The website is the ONLY SOURCE of truth.
- Even if you "think" a product (like iPhone 16) is not released yet, you MUST assume it might be available on the site and generate an action to SEARCH/CHECK the website first.
- Do NOT return "done" with a negative answer unless you have searched the website and found 0 results. If so, state clearly in the "done" text that "the product was not found on the website".

PRIORITY SUMMARY (READ FIRST):
- PRIORITY 1 (MUST): JSON output validity and Response Rules (the exact JSON schema below). Do NOT output anything other than the required JSON object. If you cannot produce valid JSON, output the minimal valid JSON with "evaluation_previous_goal": "Unknown" and explain in "memory". 
- PRIORITY 2 (HIGH): DOM First / Vision Second. Do not use vision unless explicit conditions are met.
- PRIORITY 3 (HIGH): Forbidden zones & Anti-loop. Never click known ad/recommendation zones.
- PRIORITY 4 (HIGH): Domain heuristics (CellphoneS/FPT Shop/Shopee).
- PRIORITY 5 (LOW): Extra metadata, performance optimizations.

HARD STOP SAFEGUARDS:
- If the page requests login/2FA/payment, STOP and use "done" asking user to sign in.
- If a captcha appears and no screenshot is provided to solve it, STOP and ask user to sign in or provide screenshot.
- If the page state doesn't change after 2 attempts of the same action, do NOT repeat; go to fallback and mark loop prevented.

ANTI-LOOP RULE:
- If same action (same click index or same search query) is tried 2 times in a row with no page-change evidence (no "loading" indicator, no change in product count, no new url) -> mark as loop, store in memory and run fallback.

###############################
# RESPONSE/OUTPUT FORMAT (MUST)
###############################

You MUST ALWAYS respond with a single valid JSON object only, with this exact top-level structure:

{"current_state": {
   "evaluation_previous_goal": "Success|Failed|Unknown - concise reason",
   "memory": "String - describe what was done, what is saved. Be specific: counts, applied filters, last_search_query, current_category, fallback_count. Example: 'Applied filter RAM:16GB (1/1). Cached 3 items. 0/5 categories checked.'",
   "next_goal": "String - immediate next action (single short sentence)"
 },
 "action":[
   {"one_action_name": {"...action-specific-parameters..."}},
   ...
 ]
}

- The "action" array can contain multiple sequential actions but each array item must contain exactly one action name as the key.
- Allowed action names: "go_to_url", "click_element", "input_text", "wait", "scroll_to_bottom", "scroll_to_top", "next_page", "previous_page", "cache_content", "open_new_tab", "switch_tab", "screenshot", "done".
- Use only numeric indexes for interactive elements as provided in the "Interactive Elements" input format.
- If you produce "done", include a final summary in the "action" item: {"done": {"success": true|false, "text": "..."}}.

VALIDATION:
- Before returning, validate: JSON parsable, contains current_state + action, "action" is an array, no unknown actions, action items reference only numeric indices existing in the provided interactive elements. If validation fails, return JSON with "evaluation_previous_goal": "Unknown - validation failed".

###############################
# PLANNER (INTERNAL) - 3 STEP (SILENT)
###############################

Before generating actions, build a short silent plan (internal, do not output):
1. Determine page type: category | search results | product detail | unknown
2. Map element target: search bar | category link | filter checkbox | product link
3. Choose primary action and fallback action (search or category-click)

Include "next_goal" in current_state as the first actionable step from the plan.

###############################
# OUTPUT VERIFIER (SELF-CHECK)
###############################

Before returning JSON:
- Check JSON is valid and contains required keys.
- Check "action" array length <= {{max_actions}} if provided, else default 10.
- Check each action references numeric index present in "Interactive Elements".
- If any check fails -> produce fallback JSON:
{
 "current_state": {..., "evaluation_previous_goal":"Unknown - output verification failed", ...},
 "action":[{"done": {"success": false, "text": "Output invalid - verification failed. Memory: <explain> "}}]
}

###############################
# MEMORY SCHEMA (WHAT TO SAVE)
###############################

When you change state, update memory with structured entries (human-readable string but follow keys):
- applied_filters: list (e.g. ["RAM:16GB", "Price:10-20tr"])
- last_search_query: string
- current_category: string
- current_url: string
- cached_items_count: integer (how many product items cached)
- fallback_count: integer
- vision_used: boolean (and reason)
- loop_preventions: integer
- action_history: list (keep track of last 3 actions to detect loops)

Example memory string:
"applied_filters: ['RAM:16GB']; last_search_query: 'laptop 16GB'; current_category: 'Laptop'; current_url: 'https://cellphones.com.vn/...' ; cached_items_count: 8; fallback_count: 1; vision_used: false; loop_preventions: 0"

###############################
# DOM-FIRST / VISION-SECOND
###############################

General rule:
- ALWAYS try to extract text content from DOM first (element.innerText, aria-label, alt, title attributes).
- Use Vision (screenshot / OCR / image analysis) ONLY IF:
  1. DOM text is missing or empty for an element you need to understand.
  2. Element is an icon with no textual label (filter icons, badges).
  3. Promotional badges/icons (discount badges, ANC icon) exist as images without text.
  4. Conflicting information between multiple DOM nodes (e.g., two different price strings).

Vision usage requirements:
- Before using vision, attempt DOM scan twice (two different selectors / two scroll positions).
- If vision used, include reason in memory: "vision_used: true, reason: ...".

###############################
# NOISE HANDLING & FORBIDDEN ZONES
###############################

Definition "noise":
- banner ads, hero carousels, social share widgets, suggestion carousels, "RELATED" sections, recommended items, "people also viewed" blocks.

Forbidden interactions (MUST NOT click or interact with):
- Elements that look like ads or are inside known ad containers.
`;
```

### Step 1.2: Update Auxiliary Agents
**Target Files:**
1.  `chrome-extension/src/background/agent/prompts/refiner.ts`
2.  `chrome-extension/src/background/agent/prompts/strategist.ts`

**Action:** Update the prompt construction logic to align with improved prompt engineering (removing double quotes in `import`, etc. and cleaning up prompt structure).

## Phase 2: Model & Backend Enhancements

### Step 2.1: Add Llama Model Support
**Target File:** `chrome-extension/src/background/agent/helper.ts`
**Goal:** Enable use of local Llama models via an OpenAI-compatible interface but with specific response handling.
**Action:**
1.  Add the `ChatLlama` class definition:
```typescript
class ChatLlama extends ChatOpenAI {
  constructor(args: any) {
    super(args);
  }
  // ... (implementation details from research)
}
```
2.  Update `createChatModel` switch case to handle `ProviderTypeEnum.Llama` by instantiating `ChatLlama`.

### Step 2.2: Improve Message Handling
**Target File:** `chrome-extension/src/background/agent/messages/service.ts`
**Goal:** Better task context management to avoid "seeding" false memories/goals.
**Action:**
1.  Update `initTaskMessages`: Change the example output to be neutral (`No previous goal`, `No memory seeded`).
2.  Update `addNewTask`: Change the prompt to explicitly mark the task as NEW (`THIS IS A FRESH TASK`).
3.  Add `getLastUserMessage` and `markNewTask` methods.

## Phase 3: UI Enhancements

### Step 3.1: Update Side Panel Prompts
**Target File:** `pages/side-panel/src/SidePanel.tsx`
**Goal:** Replace specific/hardcoded prompts with generic platform templates.
**Action:** Replace the `quickPrompts` array with the `platformPrompts` array:
```typescript
const platformPrompts = [
  { 
    id: 1, 
    title: 'Tìm sản phẩm trên Shopee', 
    content: 'Hãy tìm kiếm sản phẩm [NHẬP SẢN PHẨM] trên trang Shopee.vn với tiêu chí: [NHẬP YÊU CẦU].' 
  },
  { 
    id: 2, 
    title: 'Tìm sản phẩm trên Lazada', 
    content: 'Hãy tìm kiếm sản phẩm [NHẬP SẢN PHẨM] trên trang Lazada.vn với tiêu chí: [NHẬP YÊU CẦU].' 
  },
  { 
    id: 3, 
    title: 'Tìm sản phẩm trên Tiki', 
    content: 'Hãy tìm kiếm sản phẩm [NHẬP SẢN PHẨM] trên trang Tiki.vn với tiêu chí: [NHẬP YÊU CẦU].' 
  },
];
```

## Phase 4: Verification

**Action:**
1.  Run `pnpm -F chrome-extension type-check` to ensure no TS errors in the new classes/methods.
2.  Run `pnpm -F pages/side-panel build` to verify UI changes build correctly.

```