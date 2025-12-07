/* eslint-disable @typescript-eslint/no-unused-vars */
import { BasePrompt } from './base';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { AgentContext } from '@src/background/agent/types';
import { plannerSystemPromptTemplate } from './templates/planner';

export class PlannerPrompt extends BasePrompt {
  getSystemMessage(): SystemMessage {
    return new SystemMessage(plannerSystemPromptTemplate);
  }

  async getUserMessage(context: AgentContext): Promise<HumanMessage> {
    let observation = "No actions taken yet.";
    let memoryBank = "";
    let lastActionResult = "";

    // Defensive: đảm bảo history là mảng
    const history = Array.isArray((context as any).history) ? (context as any).history as any[] : [];

    if (history.length > 0) {
      // ============================================================
      // 1) BUILD POWERFUL MEMORY BANK (DÙNG LẠI SẢN PHẨM CŨ)
      // ============================================================
      const memoryItems: any[] = [];

      for (const step of history) {
        if (!step || !step.result) continue;

        // Navigator có thể trả UnifiedProductSchema tại field cache_content
        const cache = step.result.cache_content ?? null;

        if (cache && typeof cache === "object") {
          // normalize title/price/source
          const title = typeof cache.title === "string" ? cache.title : (cache.name ?? "");
          const price = cache.price ?? "";
          const source = cache.source ?? "";

          const keywords = Array.from(new Set([
            ...(typeof title === "string" ? title.toLowerCase().split(/\s+/) : []),
            title.toLowerCase()
          ].filter(Boolean)));

          const entry = {
            name: title,
            price,
            source,
            keywords,
            raw: cache,
          };
          memoryItems.push(entry);
        }
      }

      if (memoryItems.length > 0) {
        const memoryFormatted = memoryItems
          .map((p, idx) => {
            // safe stringify raw data (catch circular)
            let rawStr = "";
            try {
              rawStr = JSON.stringify(p.raw, null, 2);
            } catch {
              rawStr = "[unserializable raw data]";
            }

            return `\
[${idx + 1}]
PRODUCT_NAME: ${p.name}
PRICE: ${p.price}
SOURCE: ${p.source}
MEMORY_KEYWORDS: ${JSON.stringify(p.keywords)}
RAW_DATA: ${rawStr}
`;
          })
          .join("\n");

        memoryBank = `\
SESSION MEMORY (USE FOR RECALL):
------------------------------------------
${memoryFormatted}
------------------------------------------
If user mentions any MEMORY_KEYWORDS, you MUST answer using memory instead of planning new web_task.
`;
      }

      // ============================================================
      // 2) LAST ACTION RESULT (NGỮ CẢNH HIỆN TẠI)
      // ============================================================
      const lastStep = history[history.length - 1];

      if (lastStep && lastStep.result) {
        // prefer readable text if present, otherwise try cache_content
        if (typeof lastStep.result.text === "string" && lastStep.result.text.trim().length > 0) {
          lastActionResult = lastStep.result.text;
        } else if (lastStep.result.cache_content) {
          try {
            lastActionResult = JSON.stringify(lastStep.result.cache_content, null, 2);
          } catch {
            lastActionResult = "[unserializable cache_content]";
          }
        } else {
          lastActionResult = "No text result";
        }

        observation = `\
${memoryBank}

!!! CRITICAL UPDATE FROM NAVIGATOR !!!
------------------------------------------
LAST ACTION RESULT:
${lastActionResult}
------------------------------------------
REMEMBER:
- Prioritize LAST ACTION RESULT (90% of reasoning).
- Use SESSION MEMORY only when user mentions product keywords.
- Ignore old products unless user explicitly says "compare".
`;
      }
    }

    return new HumanMessage(observation);
  }
}
