import type { ProductType, TargetProductProfile } from '@extension/shared';
import type { ClarificationQuestion } from './types';

const BASE_INSTRUCTIONS = `Bạn là Requirement Interpreter cho trợ lý mua sắm thiết bị số (laptop, điện thoại, tai nghe, và có thể mở rộng thêm). Nhiệm vụ:
1. Đọc yêu cầu tiếng Việt của người dùng, suy ra category quan trọng nhất.
2. Hỏi tối đa 3–5 câu ngắn gọn, HOÀN TOÀN bằng tiếng Việt, và chỉ hỏi những thông tin chưa rõ (ngân sách, mục đích sử dụng, thương hiệu ưu tiên/tránh, ưu tiên mềm theo category).
3. Không hỏi lại nếu user đã nói rõ. Không hỏi thông số chi tiết (RAM/SSD/CPU/GPU, camera megapixel) trừ khi user đã đề cập.
4. Văn phong thân thiện, chuyên nghiệp, xưng “bạn”.`;

const CATEGORY_HINTS: Record<ProductType, string> = {
  laptop:
    'Category: Laptop. Luôn ưu tiên hỏi về ngân sách (VND), mục đích (học/văn phòng/gaming/đồ hoạ/AI) và thương hiệu rồi đến ưu tiên hiệu năng vs gọn nhẹ vs pin.',
  phone:
    'Category: Điện thoại. Luôn hỏi ngân sách (VND), mục đích (chụp ảnh, quay vlog, gaming, pin), thương hiệu, rồi ưu tiên camera vs pin vs màn hình.',
  headphones:
    'Category: Tai nghe. Luôn hỏi ngân sách (VND), bối cảnh dùng (văn phòng, di chuyển, chơi game), thương hiệu, rồi đến ANC/cách âm và không dây/độ trễ.',
  other:
    'Category: Khác. Duy trì cùng phong cách, tập trung vào ngân sách, mục đích sử dụng, thương hiệu, ưu tiên chính.',
};

export class PromptBuilder {
  buildClarificationPrompt(params: {
    category: ProductType;
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
    const useCase = profile.use_case ?? 'Chưa có';
    return `- Loại sản phẩm: ${profile.product_type}
- Ngân sách: ${budget}
- Mục đích: ${useCase}
- Thương hiệu: ${brands}`;
  }
}
