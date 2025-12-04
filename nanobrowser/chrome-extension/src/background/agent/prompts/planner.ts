/* eslint-disable @typescript-eslint/no-unused-vars */
import { BasePrompt } from './base';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { AgentContext } from '@src/background/agent/types';
import { 
  plannerSystemPromptTemplate, 
  fptShopPlannerPromptTemplate 
} from './templates/planner';

export class PlannerPrompt extends BasePrompt {
  getSystemMessage(): SystemMessage {
    return new SystemMessage(plannerSystemPromptTemplate);
  }

  async getUserMessage(context: AgentContext): Promise<HumanMessage> {
    try {
      const page = await context.browserContext.getCurrentPage();
      
      // FIX: Added parentheses () because page.url is a function
      if (page && page.url().includes('fptshop.com.vn')) {
        
        // Inject the specialized FPT instructions
        return new HumanMessage(`
          *** IMPORTANT CONTEXT UPDATE ***
          You are currently browsing FPT Shop (fptshop.com.vn).
          Please prioritize the following specialized rules for this domain:

          ${fptShopPlannerPromptTemplate}
        `);
      }
    } catch (error) {
      console.warn('Error detecting FPT Shop URL:', error);
    }

    return new HumanMessage('');
  }
}
