import type { ClarificationQuestionUiVariant, TargetProductType, TargetProductProfile } from '@extension/shared';

export interface ClarificationQuestion {
  id: string;
  category: TargetProductType;
  text: string;
  fieldHints: string[];
  isCore: boolean;
  uiVariant?: ClarificationQuestionUiVariant;
}

export interface RequirementClarificationRequest {
  sessionId: string;
  category: TargetProductType;
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
    }
  | {
      status: 'error';
      error: string;
    };

export type QuestionAnswerMap = Record<string, string>;

export interface QuestionDefinition extends ClarificationQuestion {
  shouldAsk: (profile: TargetProductProfile) => boolean;
}
