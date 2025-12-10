import type { TargetProductProfileRepository } from '@extension/storage';
import type { TargetProductType, TargetProductProfile } from '@extension/shared';
import { createLogger } from '@src/background/log';
import { QuestionLibrary, SUPPORTED_CATEGORIES } from './questionLibrary';
import { ProfileParser } from './profileParser';
import { PromptBuilder } from './promptBuilder';
import { detectClarificationBypassIntent } from './intentUtils';
import type { QuestionAnswerMap, RequirementInterpreterResult } from './types';

const logger = createLogger('RequirementInterpreterService');

export interface RequirementInterpreterDependencies {
  repository: TargetProductProfileRepository;
  questionLibrary?: QuestionLibrary;
  profileParser?: ProfileParser;
  promptBuilder?: PromptBuilder;
}

interface SessionContext {
  sessionId: string;
  rawTask: string;
  category: TargetProductType;
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
    // Lục trong repo xem có hồ sơ sản phẩm mục tiêu của session với id tương ứng ko
    const existing = await this.repository.get(sessionId);

    const category = overrides?.product_type ?? existing?.product_type ?? this.questionLibrary.inferCategory(rawTask);
    if (!category) {
      return {
        status: 'error',
        error: `Không xác định được loại sản phẩm. Hỗ trợ: ${SUPPORTED_CATEGORIES.join(', ')}`,
      };
    }

    this.sessionCache.set(sessionId, { sessionId, rawTask, category });

    // Tạo lại hồ sơ cơ sở cho session id hiện tại
    const baseProfile =
      existing && existing.product_type === category ? existing : this.profileParser.createBaseProfile(category);

    const autoExtracted = await this.profileParser.autoExtractFromTask(rawTask);
    const mergedOverrides = overrides ? { ...autoExtracted, ...overrides } : autoExtracted;

    const merged = this.profileParser.mergeOverrides(baseProfile, mergedOverrides);

    // Check if the user's intent is comparison/analysis rather than purchase.
    // If so, mark all clarification questions as opted-out to bypass the form.
    if (detectClarificationBypassIntent(rawTask)) {
      const resolvedProfile = this.questionLibrary.markAllQuestionsResolved(merged, category);
      await this.repository.set(sessionId, resolvedProfile);

      return {
        status: 'complete',
        profile: resolvedProfile,
      };
    }

    // Lấy ra các câu hỏi còn cần làm rõ trong hồ sơ hợp nhất
    const pendingQuestions = this.questionLibrary.getPendingQuestions(merged);

    // Nếu còn câu hỏi cần làm rõ
    if (pendingQuestions.length > 0) {
      // Trước hết, lưu hồ sơ cơ sở vừa được ghi đè vào trong repo
      await this.repository.set(sessionId, merged);

      // Tạo prompt để hỏi người dùng các câu hỏi làm rõ
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

    // Nếu không còn câu hỏi nào cần làm rõ
    return {
      status: 'complete',
      profile: merged,
    };
  }

  async submitAnswers(sessionId: string, answers: QuestionAnswerMap): Promise<RequirementInterpreterResult> {
    const storedProfile = await this.repository.get(sessionId);
    if (!storedProfile) {
      return {
        status: 'error',
        error: 'Phiên làm rõ đã hết hạn, vui lòng gửi lại yêu cầu.',
      };
    }
    // Add logging to trace the profile state before applying answers.
    logger.debug('Profile before applying answers:', storedProfile);

    const updatedProfile = await this.profileParser.applyAnswers(storedProfile, answers);
    await this.repository.set(sessionId, updatedProfile);

    // Add logging to trace the profile state after applying answers.
    logger.debug('Profile after applying answers:', updatedProfile);

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
