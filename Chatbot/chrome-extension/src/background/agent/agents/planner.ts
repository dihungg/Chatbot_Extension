import { BaseAgent, type BaseAgentOptions, type ExtraAgentOptions } from './base';
import { createLogger } from '@src/background/log';
import { z } from 'zod';
import type { AgentOutput } from '../types';
import type { TargetProductProfile } from '@extension/shared';
import { HumanMessage } from '@langchain/core/messages';
import { Actors, ExecutionState } from '../event/types';
import { TargetProductDescriptionBuilder } from '../prompts/targetProductDescriptionBuilder';
import {
  ChatModelAuthError,
  ChatModelBadRequestError,
  ChatModelForbiddenError,
  isAbortedError,
  isAuthenticationError,
  isBadRequestError,
  isForbiddenError,
  LLM_FORBIDDEN_ERROR_MESSAGE,
  RequestCancelledError,
} from './errors';
import { filterExternalContent } from '../messages/utils';
const logger = createLogger('PlannerAgent');

// Define Zod schema for planner output
export const plannerOutputSchema = z.object({
  observation: z.string(),
  challenges: z.string(),
  done: z.union([
    z.boolean(),
    z.string().transform(val => {
      if (val.toLowerCase() === 'true') return true;
      if (val.toLowerCase() === 'false') return false;
      throw new Error('Invalid boolean string');
    }),
  ]),
  next_steps: z.string(),
  final_answer: z.string(),
  reasoning: z.string(),
  web_task: z.union([
    z.boolean(),
    z.string().transform(val => {
      if (val.toLowerCase() === 'true') return true;
      if (val.toLowerCase() === 'false') return false;
      throw new Error('Invalid boolean string');
    }),
  ]),
});

export type PlannerOutput = z.infer<typeof plannerOutputSchema>;

export class PlannerAgent extends BaseAgent<typeof plannerOutputSchema, PlannerOutput> {
  private profileDescriptionBuilder = new TargetProductDescriptionBuilder();

  constructor(options: BaseAgentOptions, extraOptions?: Partial<ExtraAgentOptions>) {
    super(plannerOutputSchema, options, { ...extraOptions, id: 'planner' });
  }

  async execute(): Promise<AgentOutput<PlannerOutput>> {
    try {
      this.context.emitEvent(Actors.PLANNER, ExecutionState.STEP_START, 'Planning...');
      // get all messages from the message manager, state message should be the last one
      const messages = this.context.messageManager.getMessages();
      // Use full message history except the first one
      const plannerMessages = [this.prompt.getSystemMessage(), ...messages.slice(1)];

      // Inject the user's profile and all clarification information right after system prompt
      if (this.context.targetProductProfile) {
        // Add logging to confirm the profile is accessible.
        logger.debug('Target product profile found, formatting for planner.', this.context.targetProductProfile);
        const profileMessage = this.formatProfileMessage(this.context.targetProductProfile);
        // Add logging to trace the formatted profile message.
        logger.debug('Formatted profile message:', profileMessage.content);
        plannerMessages.splice(1, 0, profileMessage);
      } else {
        // Add logging to confirm when no profile is found.
        logger.debug('No target product profile found in context.');
      }

      // Debug
      console.log(plannerMessages);

      // Remove images from last message if vision is not enabled for planner but vision is enabled
      if (!this.context.options.useVisionForPlanner && this.context.options.useVision) {
        const lastStateMessage = plannerMessages[plannerMessages.length - 1];
        let newMsg = '';

        if (Array.isArray(lastStateMessage.content)) {
          for (const msg of lastStateMessage.content) {
            if (msg.type === 'text') {
              newMsg += msg.text;
            }
            // Skip image_url messages
          }
        } else {
          newMsg = lastStateMessage.content;
        }

        plannerMessages[plannerMessages.length - 1] = new HumanMessage(newMsg);
      }

      // print messages for debugging
      logger.debug('Planner Messages:');
      plannerMessages.forEach((msg, index) => {
        logger.debug(`Message ${index + 1} (${msg._getType()}): ${JSON.stringify(msg.content)}`);
      });

      const modelOutput = await this.invoke(plannerMessages);
      if (!modelOutput) {
        throw new Error('Failed to validate planner output');
      }

      // clean the model output
      const observation = filterExternalContent(modelOutput.observation);
      const final_answer = filterExternalContent(modelOutput.final_answer);
      const next_steps = filterExternalContent(modelOutput.next_steps);
      const challenges = filterExternalContent(modelOutput.challenges);
      const reasoning = filterExternalContent(modelOutput.reasoning);

      const cleanedPlan: PlannerOutput = {
        ...modelOutput,
        observation,
        challenges,
        reasoning,
        final_answer,
        next_steps,
      };

      // If task is done, emit the final answer; otherwise emit next steps
      const eventMessage = cleanedPlan.done ? cleanedPlan.final_answer : cleanedPlan.next_steps;
      this.context.emitEvent(Actors.PLANNER, ExecutionState.STEP_OK, eventMessage);
      logger.info('Planner output', JSON.stringify(cleanedPlan, null, 2));

      return {
        id: this.id,
        result: cleanedPlan,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // Check if this is an authentication error
      if (isAuthenticationError(error)) {
        throw new ChatModelAuthError(errorMessage, error);
      } else if (isBadRequestError(error)) {
        throw new ChatModelBadRequestError(errorMessage, error);
      } else if (isAbortedError(error)) {
        throw new RequestCancelledError(errorMessage);
      } else if (isForbiddenError(error)) {
        throw new ChatModelForbiddenError(LLM_FORBIDDEN_ERROR_MESSAGE, error);
      }

      logger.error(`Planning failed: ${errorMessage}`);
      this.context.emitEvent(Actors.PLANNER, ExecutionState.STEP_FAIL, `Planning failed: ${errorMessage}`);
      return {
        id: this.id,
        error: errorMessage,
      };
    }
  }

  /**
   * Format user's target product profile into a human message for the planner
   * Includes all clarification information: hard constraints, soft constraints, and context history
   *
   * @param profile - The user's target product profile
   * @returns HumanMessage containing formatted profile information
   */
  private formatProfileMessage(profile: TargetProductProfile): HumanMessage {
    const profileDescription = this.profileDescriptionBuilder.build(profile);

    const message = `CRITICAL USER PROFILE AND REQUIREMENTS:
Here is the user's profile with their specific requirements and context. You MUST adhere to these constraints in all subsequent planning and observations.

${profileDescription}

CLARIFICATION STATUS:
- Opt-outs (do not ask about these): ${JSON.stringify(profile.clarification_opt_outs || {})}

IMPORTANT:
1. Use the Hard Constraints (Product Type, Budget, Brands) as strict filters where applicable.
2. Read and interpret the Requirements Context to understand the user's specific needs.
3. Do NOT ask clarifying questions about topics the user has opted out of.
4. Ensure all recommendations respect these constraints throughout your planning.`;

    return new HumanMessage(message);
  }
}
