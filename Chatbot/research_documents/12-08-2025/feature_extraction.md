# Updated Research Findings: Feature Extraction from `diff1` & `diff2`

Based on the user's requirement to **retain the current directory structure** (non-monorepo) and **prioritize existing features** while importing updates, I have isolated specific high-value features from the diffs.

## 1. Key Feature Updates Identified

The `diff1.txt` branch contains significant logic enhancements that are missing or deleted in `diff2.txt`. Therefore, `diff1.txt` is the primary source for feature updates.

### A. Core Agent Logic (High Value)
1.  **Navigator Agent "Safeguard System"**
    -   **Source**: `chrome-extension/src/background/agent/prompts/templates/navigator.ts` (in `diff1`)
    -   **Feature**: Introduces a strict "Real-time Truth Rule" (trust website over internal knowledge), "Anti-loop Rule" (prevent repetitive actions), and a "DOM-First / Vision-Second" priority system to optimize performance and cost.
    -   **Recommendation**: **Adopt**. This is a critical stability update.

2.  **Refiner & Strategist Agent Improvements**
    -   **Source**: `chrome-extension/src/background/agent/prompts/refiner.ts` & `strategist.ts`
    -   **Feature**: Improved prompt engineering for better user profile handling and search strategy formulation.
    -   **Conflict**: `diff2` deletes these files. `diff1` updates them.
    -   **Recommendation**: **Adopt updates from `diff1`**. This aligns with your goal to "prioritize features in my branch" (since you already have these agents).

3.  **Llama Model Support**
    -   **Source**: `chrome-extension/src/background/agent/helper.ts`
    -   **Feature**: Adds a custom `ChatLlama` class to handle Llama API response formats, enabling local LLM support via Llama.
    -   **Recommendation**: **Adopt**. Expands model compatibility.

### B. UI & User Experience
4.  **Generic Platform Prompts**
    -   **Source**: `pages/side-panel/src/SidePanel.tsx`
    -   **Feature**: Replaces hardcoded "Quick Prompts" (e.g., "Find iPhone 15") with generic templates (e.g., "Find [Product] on Shopee").
    -   **Recommendation**: **Adopt**. Makes the UI more flexible for users.

### C. Architectural Shifts (Caution Required)
5.  **New Planner & Executor Architecture**
    -   **Source**: `background/index.ts`, `agent/executor.ts`, `agent/prompts/planner.ts`
    -   **Change**: The other branches move away from the `RequirementInterpreter` (pre-clarification) model to a more autonomous `Executor` model where the Planner builds its own "Memory Bank" from history.
    -   **Risk**: This is a major refactor. Adopting this would require deleting your current `RequirementInterpreter` logic and replacing `planner.ts` entirely.
    -   **Recommendation**: **Partial Adoption**. 
        -   **Do NOT** blindly replace `index.ts` or `executor.ts` yet, as it breaks your current flow.
        -   **DO** update `messages/service.ts` to improve how tasks are initialized (`initTaskMessages`), as it adds better context handling without breaking architecture.

## 2. Action Plan

To implement these features without changing your directory structure:

1.  **Update `navigator.ts` Template**: Overwrite `chrome-extension/src/background/agent/prompts/templates/navigator.ts` with the "Safeguard System" content from `diff1`.
2.  **Update Refiner/Strategist**: Apply content updates to `refiner.ts` and `strategist.ts` from `diff1`.
3.  **Update `helper.ts`**: Add `ChatLlama` class and updated model helpers.
4.  **Update Side Panel**: Modify `SidePanel.tsx` to use the new `platformPrompts` list.
5.  **Update Message Service**: Apply logic improvements in `chrome-extension/src/background/agent/messages/service.ts`.

This strategy gives you the **intelligence upgrades** (Navigator safeguards, better prompts) and **capability upgrades** (Llama support) without breaking your existing **Requirement Interpreter** workflow or forcing a monorepo structure.
