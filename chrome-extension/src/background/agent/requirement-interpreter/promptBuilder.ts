import type { TargetProductType, TargetProductProfile } from '@extension/shared';
import type { ClarificationQuestion } from './types';

const BASE_INSTRUCTIONS = `Bạn là Requirement Interpreter cho trợ lý mua sắm thiết bị số. Nhiệm vụ: Đặt câu hỏi làm rõ nhu cầu.`;

const CATEGORY_HINTS: Record<TargetProductType, string> = {
  laptop: 'Category: Laptop.',
  phone: 'Category: Điện thoại.',
  headphones: 'Category: Tai nghe.',
  other: 'Category: Khác.',
};

export class PromptBuilder {
  buildClarificationPrompt(params: {
    category: TargetProductType;
    rawTask: string;
    questions: ClarificationQuestion[];
    partialProfile: TargetProductProfile;
  }): string {
    const { category, rawTask, questions, partialProfile } = params;
    const questionList = questions.map((question, index) => `${index + 1}. ${question.text}`).join('\n');
    const knownFacts = this.buildProfileSnapshot(partialProfile);
    return `${BASE_INSTRUCTIONS}

${CATEGORY_HINTS[category]}

User request: ${rawTask}

Thông tin đã biết:
${knownFacts}

Những câu hỏi cần gửi cho người dùng:
${questionList}`;
  }

  buildProfileSnapshot(profile: TargetProductProfile): string {
    const budget =
      typeof profile.budget_vnd === 'number'
        ? `${profile.budget_vnd.toLocaleString('vi-VN')} VND`
        : profile.budget_vnd
          ? `${profile.budget_vnd.min.toLocaleString('vi-VN')}–${profile.budget_vnd.max.toLocaleString('vi-VN')} VND`
          : 'Chưa có';
    const brands =
      profile.pref_brands.length > 0 || profile.avoid_brands.length > 0
        ? `Ưu tiên: ${profile.pref_brands.join(', ') || 'không'} | Tránh: ${profile.avoid_brands.join(', ') || 'không'}`
        : 'Chưa có';

    const context = profile.requirements_context?.length
      ? profile.requirements_context.map(c => `- ${c}`).join('\n')
      : 'Chưa có';

    return `- Loại sản phẩm: ${profile.product_type}
- Ngân sách: ${budget}
- Thương hiệu: ${brands}
- Context/Ghi chú:
${context}`;
  }
}
