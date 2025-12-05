export interface ClarificationQuestion {
  id: string;
  text: string;
  fieldHints: string[];
  isCore: boolean;
  category: string;
}

export interface RequirementClarificationPayload {
  sessionId: string;
  category: string;
  questions: ClarificationQuestion[];
  prompt: string;
}
