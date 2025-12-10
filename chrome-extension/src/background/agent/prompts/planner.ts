import type { UnifiedProductSchema } from '@extension/shared';
import { BasePrompt } from './base';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { AgentContext } from '@src/background/agent/types';
import { plannerSystemPromptTemplate } from './templates/planner';

export class PlannerPrompt extends BasePrompt {
  getSystemMessage(): SystemMessage {
    return new SystemMessage(plannerSystemPromptTemplate);
  }

  async getUserMessage(context: AgentContext): Promise<HumanMessage> {
    let observation = 'No actions taken yet.';
    let memoryBank = '';
    let lastActionResult = '';

    const history = context.history.history;

    if (history.length > 0) {
      // ============================================================
      // 1) BUILD POWERFUL MEMORY BANK (DÙNG LẠI SẢN PHẨM CŨ)
      // ============================================================
      const memoryItems: UnifiedProductSchema[] = [];

      for (const step of history) {
        if (!step || !step.result) continue;

        for (const actionResult of step.result) {
          if (actionResult.extractedContent) {
            try {
              // The extracted content from a cache_content action might be a JSON
              // string of UnifiedProductSchema, or an array of them.
              // It can be wrapped in ```json ... ```
              const content = JSON.parse(actionResult.extractedContent.replace(/```json\n?|\n?```/g, ''));
              const products: UnifiedProductSchema[] = Array.isArray(content) ? content : [content];

              for (const product of products) {
                if (product && product.product_type) {
                  // a simple check for a valid product
                  memoryItems.push(product);
                }
              }
            } catch (e) {
              // not a json, or not a valid product schema
            }
          }
        }
      }

      if (memoryItems.length > 0) {
        const memoryFormatted = memoryItems
          .map((p, idx) => {
            const keywords = Array.from(new Set(p.name.toLowerCase().split(/\s+/))).filter(Boolean);
            // safe stringify raw data (catch circular)
            let rawStr = '';
            try {
              rawStr = JSON.stringify(p, null, 2);
            } catch {
              rawStr = '[unserializable raw data]';
            }

            return `\
[${idx + 1}]
PRODUCT_NAME: ${p.name}
PRICE: ${p.price_vnd}
SOURCE: ${p.url}
MEMORY_KEYWORDS: ${JSON.stringify(keywords)}
RAW_DATA: ${rawStr}
`;
          })
          .join('\n');

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

      if (lastStep && lastStep.result && lastStep.result.length > 0) {
        const lastActionResultItem = lastStep.result[lastStep.result.length - 1];
        // prefer readable text if present, otherwise try cache_content
        if (lastActionResultItem.extractedContent) {
          lastActionResult = lastActionResultItem.extractedContent;
        } else {
          lastActionResult = 'No text result';
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
