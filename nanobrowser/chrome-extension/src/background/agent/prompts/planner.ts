/* eslint-disable @typescript-eslint/no-unused-vars */
import { BasePrompt } from './base';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { AgentContext } from '@src/background/agent/types';
import { plannerSystemPromptTemplate } from './templates/planner';

export class PlannerPrompt extends BasePrompt {
  getSystemMessage(): SystemMessage {
    return new SystemMessage(plannerSystemPromptTemplate);
  }

  /**
   * Lấy user message gần nhất từ MessageManager nếu có.
   * Tránh trả chuỗi rỗng - nếu không có message nào thì trả placeholder
   * để planner hiểu rõ task mới thay vì lặp lại history cũ.
   */
  async getUserMessage(context: AgentContext): Promise<HumanMessage> {
    try {
      // messageManager phải expose getLastUserMessage() (string | null)
      const last = (context.messageManager as any).getLastUserMessage?.();
      const content = typeof last === 'string' && last.trim().length > 0 ? last : '[NO_USER_MESSAGE_PROVIDED]';
      return new HumanMessage(content);
    } catch (err) {
      // safest fallback: not empty
      return new HumanMessage('[NO_USER_MESSAGE_PROVIDED]');
    }
  }
}
