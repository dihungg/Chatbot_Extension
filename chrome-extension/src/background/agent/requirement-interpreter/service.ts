import type { TargetProductProfileRepository } from '@extension/storage';
import type { ProductType, TargetProductProfile } from '@extension/shared';
import { QuestionLibrary } from './questionLibrary';
import { ProfileParser } from './profileParser';
import { PromptBuilder } from './promptBuilder';
import type { QuestionAnswerMap, RequirementInterpreterResult } from './types';

export interface RequirementInterpreterDependencies {
  repository: TargetProductProfileRepository;
  questionLibrary?: QuestionLibrary;
  profileParser?: ProfileParser;
  promptBuilder?: PromptBuilder;
}

interface SessionContext {
  sessionId: string;
  rawTask: string;
  category: ProductType;
}

export class RequirementInterpreterService {
  private readonly repository: TargetProductProfileRepository;
  private readonly questionLibrary: QuestionLibrary;
  private readonly profileParser: ProfileParser;
  private readonly promptBuilder: PromptBuilder;
  private readonly sessionCache = new Map<string, SessionContext>();

  constructor(deps: RequirementInterpreterDependencies) {
    this.repository = deps.repository;
    this.questionLibrary = deps.questionLibrary ?? new QuestionLibrary();
    this.profileParser = deps.profileParser ?? new ProfileParser();
    this.promptBuilder = deps.promptBuilder ?? new PromptBuilder();
  }

  async ensureProfile(
    sessionId: string,
    rawTask: string,
    overrides?: Partial<TargetProductProfile>,
  ): Promise<RequirementInterpreterResult> {
    const existing = await this.repository.get(sessionId);
    const category =
      overrides?.product_type ?? existing?.product_type ?? this.questionLibrary.inferCategory(rawTask, 'laptop');
    this.sessionCache.set(sessionId, { sessionId, rawTask, category });

    const baseProfile =
      existing && existing.product_type === category ? existing : this.profileParser.createBaseProfile(category);
    const merged = this.profileParser.mergeOverrides(baseProfile, overrides);

    const pendingQuestions = this.questionLibrary.getPendingQuestions(merged);
    if (pendingQuestions.length > 0) {
      await this.repository.set(sessionId, merged);
      const prompt = this.promptBuilder.buildClarificationPrompt({
        category,
        rawTask,
        questions: pendingQuestions,
        partialProfile: merged,
      });

      return {
        status: 'needs_clarification',
        request: {
          sessionId,
          category,
          questions: pendingQuestions,
          prompt,
        },
      };
    }

    await this.repository.set(sessionId, merged);
    return {
      status: 'complete',
      profile: merged,
    };
  }

  async submitAnswers(sessionId: string, answers: QuestionAnswerMap): Promise<RequirementInterpreterResult> {
    const storedProfile = (await this.repository.get(sessionId)) ?? this.profileParser.createBaseProfile('laptop');
    const updatedProfile = this.profileParser.applyAnswers(storedProfile, answers);
    await this.repository.set(sessionId, updatedProfile);

    const pendingQuestions = this.questionLibrary.getPendingQuestions(updatedProfile);
    if (pendingQuestions.length > 0) {
      const context = this.sessionCache.get(sessionId);
      const rawTask = context?.rawTask ?? '';
      const prompt = this.promptBuilder.buildClarificationPrompt({
        category: updatedProfile.product_type,
        rawTask,
        questions: pendingQuestions,
        partialProfile: updatedProfile,
      });
      return {
        status: 'needs_clarification',
        request: {
          sessionId,
          category: updatedProfile.product_type,
          questions: pendingQuestions,
          prompt,
        },
      };
    }

    return {
      status: 'complete',
      profile: updatedProfile,
    };
  }

  async clearProfile(sessionId: string): Promise<void> {
    await this.repository.clear(sessionId);
    this.sessionCache.delete(sessionId);
  }
}
