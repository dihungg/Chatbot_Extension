import type { ClarificationQuestionUiVariant } from '@extension/shared';

export interface ClarificationQuestion {
  id: string;
  text: string;
  fieldHints: string[];
  isCore: boolean;
  category: string;
  uiVariant?: ClarificationQuestionUiVariant;
}

export interface RequirementClarificationPayload {
  sessionId: string;
  category: string;
  questions: ClarificationQuestion[];
  prompt: string;
}
