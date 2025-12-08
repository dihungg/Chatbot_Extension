import type { ClarificationQuestionUiVariant, ProductType, TargetProductProfile } from '@extension/shared';
import type { ClarificationQuestion, QuestionDefinition } from './types';

export const SUPPORTED_CATEGORIES = ['laptop', 'phone', 'headphones'] as const;

const CATEGORY_KEYWORDS: Record<(typeof SUPPORTED_CATEGORIES)[number], string[]> = {
  laptop: ['laptop', 'máy tính xách tay', 'macbook', 'notebook'],
  phone: ['điện thoại', 'smartphone', 'iphone', 'android'],
  headphones: ['tai nghe', 'headphone', 'earbuds', 'earpod', 'tai nghe chống ồn'],
};

const UNSUPPORTED_KEYWORDS = [
  'tủ lạnh',
  'refrigerator',
  'máy giặt',
  'washing machine',
  'tivi',
  'tv',
  'television',
  'điều hoà',
  'điều hòa',
  'máy lạnh',
  'air conditioner',
  'lò vi sóng',
  'microwave',
  'bình nước',
  'water heater',
  'quạt',
  'fan',
  'bàn là',
  'iron',
] as const;

const MAX_QUESTIONS = 5;

const BRAND_SPLIT_VARIANT: ClarificationQuestionUiVariant = {
  type: 'brand_split',
  fieldMap: ['pref_brands', 'avoid_brands'],
};

const hasOptedOut = (profile: TargetProductProfile, questionId: string): boolean =>
  Boolean(profile.clarification_opt_outs?.[questionId]);

const hasBrands = (profile: TargetProductProfile, questionId: string): boolean => {
  if (hasOptedOut(profile, questionId)) {
    return true;
  }
  return (profile.pref_brands?.length ?? 0) > 0 || (profile.avoid_brands?.length ?? 0) > 0;
};

// Generic check: If the question hasn't been marked as resolved (opted out or answered), ask it.
const shouldAskGeneric = (profile: TargetProductProfile, questionId: string): boolean => {
  return !hasOptedOut(profile, questionId);
};

const QUESTION_DEFINITIONS: Record<ProductType, QuestionDefinition[]> = {
  laptop: [
    {
      id: 'laptop_budget',
      category: 'laptop',
      text: 'Ngân sách dự kiến cho laptop này khoảng bao nhiêu (ví dụ: 15–25 triệu)?',
      fieldHints: ['budget_vnd'],
      isCore: true,
      shouldAsk: profile => !hasOptedOut(profile, 'laptop_budget') && profile.budget_vnd === null,
    },
    {
      id: 'laptop_use_case',
      category: 'laptop',
      text: 'Bạn chủ yếu dùng laptop để làm gì (học tập, văn phòng, lập trình, đồ hoạ, gaming, AI, v.v.)?',
      fieldHints: [],
      isCore: true,
      shouldAsk: profile => shouldAskGeneric(profile, 'laptop_use_case'),
    },
    {
      id: 'laptop_brands',
      category: 'laptop',
      text: 'Có thương hiệu nào bạn muốn ưu tiên hoặc tránh không?',
      fieldHints: ['pref_brands', 'avoid_brands'],
      isCore: true,
      uiVariant: BRAND_SPLIT_VARIANT,
      shouldAsk: profile => !hasBrands(profile, 'laptop_brands'),
    },
    {
      id: 'laptop_priority',
      category: 'laptop',
      text: 'Bạn ưu tiên hiệu năng, sự gọn nhẹ, hay thời lượng pin hơn?',
      fieldHints: [],
      isCore: false,
      shouldAsk: profile => shouldAskGeneric(profile, 'laptop_priority'),
    },
    {
      id: 'laptop_power',
      category: 'laptop',
      text: 'Bạn có cần GPU rời hoặc cấu hình mạnh cho đồ hoạ/gaming/AI không?',
      fieldHints: [],
      isCore: false,
      shouldAsk: profile => shouldAskGeneric(profile, 'laptop_power'),
    },
  ],
  phone: [
    {
      id: 'phone_budget',
      category: 'phone',
      text: 'Ngân sách cho điện thoại bạn đang tìm là khoảng bao nhiêu (ví dụ: dưới 10 triệu, 10–15 triệu, 15–20 triệu)?',
      fieldHints: ['budget_vnd'],
      isCore: true,
      shouldAsk: profile => !hasOptedOut(profile, 'phone_budget') && profile.budget_vnd === null,
    },
    {
      id: 'phone_use_case',
      category: 'phone',
      text: 'Điện thoại sẽ dùng chủ yếu cho mục đích nào (chụp ảnh, quay vlog, làm việc, gaming, pin trâu, v.v.)?',
      fieldHints: [],
      isCore: true,
      shouldAsk: profile => shouldAskGeneric(profile, 'phone_use_case'),
    },
    {
      id: 'phone_brands',
      category: 'phone',
      text: 'Bạn có thương hiệu nào thích hoặc muốn tránh không?',
      fieldHints: ['pref_brands', 'avoid_brands'],
      isCore: true,
      uiVariant: BRAND_SPLIT_VARIANT,
      shouldAsk: profile => !hasBrands(profile, 'phone_brands'),
    },
    {
      id: 'phone_priority',
      category: 'phone',
      text: 'Bạn ưu tiên điều gì hơn: camera, pin, hay màn hình?',
      fieldHints: [],
      isCore: false,
      shouldAsk: profile => shouldAskGeneric(profile, 'phone_priority'),
    },
    {
      id: 'phone_features',
      category: 'phone',
      text: 'Bạn có cần 5G hoặc tính năng đặc biệt (chống nước, sạc nhanh) không?',
      fieldHints: [],
      isCore: false,
      shouldAsk: profile => shouldAskGeneric(profile, 'phone_features'),
    },
  ],
  headphones: [
    {
      id: 'headphones_budget',
      category: 'headphones',
      text: 'Ngân sách cho tai nghe này khoảng bao nhiêu (ví dụ: dưới 3 triệu, 3–5 triệu)?',
      fieldHints: ['budget_vnd'],
      isCore: true,
      shouldAsk: profile => !hasOptedOut(profile, 'headphones_budget') && profile.budget_vnd === null,
    },
    {
      id: 'headphones_use_case',
      category: 'headphones',
      text: 'Bạn sẽ dùng tai nghe chủ yếu trong tình huống nào (làm việc văn phòng, di chuyển, chơi game, thu âm, nghe nhạc)?',
      fieldHints: [],
      isCore: true,
      shouldAsk: profile => shouldAskGeneric(profile, 'headphones_use_case'),
    },
    {
      id: 'headphones_brands',
      category: 'headphones',
      text: 'Có thương hiệu nào bạn thích hoặc muốn tránh không?',
      fieldHints: ['pref_brands', 'avoid_brands'],
      isCore: true,
      uiVariant: BRAND_SPLIT_VARIANT,
      shouldAsk: profile => !hasBrands(profile, 'headphones_brands'),
    },
    {
      id: 'headphones_isolation',
      category: 'headphones',
      text: 'Bạn có cần chống ồn chủ động (ANC) hoặc khả năng cách âm tốt không?',
      fieldHints: [],
      isCore: false,
      shouldAsk: profile => shouldAskGeneric(profile, 'headphones_isolation'),
    },
    {
      id: 'headphones_style',
      category: 'headphones',
      text: 'Bạn ưu tiên tai nghe không dây, độ trễ thấp cho chơi game, hay chất âm nhạc tính hơn?',
      fieldHints: [],
      isCore: false,
      shouldAsk: profile => shouldAskGeneric(profile, 'headphones_style'),
    },
  ],
  other: [],
};

export class QuestionLibrary {
  inferCategory(rawTask: string): ProductType | null {
    const normalized = rawTask.toLowerCase();
    if (!normalized.trim()) {
      return null;
    }

    if (UNSUPPORTED_KEYWORDS.some(keyword => normalized.includes(keyword))) {
      return null;
    }

    for (const category of SUPPORTED_CATEGORIES) {
      const keywords = CATEGORY_KEYWORDS[category];
      if (keywords.some(keyword => normalized.includes(keyword))) {
        return category;
      }
    }

    return null;
  }

  getQuestionsForCategory(category: ProductType): QuestionDefinition[] {
    return QUESTION_DEFINITIONS[category] ?? [];
  }

  getQuestionById(questionId: string): QuestionDefinition | undefined {
    return Object.values(QUESTION_DEFINITIONS)
      .flat()
      .find(question => question.id === questionId);
  }

  getPendingQuestions(profile: TargetProductProfile): ClarificationQuestion[] {
    const questions = this.getQuestionsForCategory(profile.product_type);

    const pending = questions.filter(question => question.shouldAsk(profile));

    return pending.slice(0, MAX_QUESTIONS).map(question => ({
      id: question.id,
      category: question.category,
      text: question.text,
      fieldHints: question.fieldHints,
      isCore: question.isCore,
      uiVariant: question.uiVariant,
    }));
  }
}
