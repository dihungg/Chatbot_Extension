/* eslint-disable @typescript-eslint/no-unused-vars */
import { BasePrompt } from './base';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { AgentContext } from '@src/background/agent/types';
import { plannerSystemPromptTemplate } from './templates/planner';
import { TargetProductDescriptionBuilder } from './targetProductDescriptionBuilder';

export class PlannerPrompt extends BasePrompt {
  private readonly descriptionBuilder = new TargetProductDescriptionBuilder();

  getSystemMessage(): SystemMessage {
    return new SystemMessage(plannerSystemPromptTemplate);
  }

  async getUserMessage(context: AgentContext): Promise<HumanMessage> {
    if (!context.targetProductProfile) {
      return new HumanMessage('');
    }
    const description = this.descriptionBuilder.build(context.targetProductProfile);
    return new HumanMessage(description);
  }
}
