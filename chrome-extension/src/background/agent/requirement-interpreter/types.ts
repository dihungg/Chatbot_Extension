import type { ProductType, TargetProductProfile } from '@extension/shared';

export interface ClarificationQuestion {
  id: string;
  category: ProductType;
  text: string;
  fieldHints: string[];
  isCore: boolean;
}

export interface RequirementClarificationRequest {
  sessionId: string;
  category: ProductType;
  questions: ClarificationQuestion[];
  prompt: string;
}

export type RequirementInterpreterResult =
  | {
      status: 'complete';
      profile: TargetProductProfile;
    }
  | {
      status: 'needs_clarification';
      request: RequirementClarificationRequest;
    };

export type QuestionAnswerMap = Record<string, string>;

export interface QuestionDefinition extends ClarificationQuestion {
  shouldAsk: (profile: TargetProductProfile) => boolean;
}
