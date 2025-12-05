import type { ProductType, TargetProductProfile } from '@extension/shared';
import type { ClarificationQuestion, QuestionDefinition } from './types';

const CATEGORY_KEYWORDS: Record<ProductType, string[]> = {
  laptop: ['laptop', 'máy tính xách tay', 'macbook', 'notebook'],
  phone: ['điện thoại', 'smartphone', 'iphone', 'android'],
  headphones: ['tai nghe', 'headphone', 'earbuds', 'earpod', 'tai nghe chống ồn'],
  other: [],
};

const MAX_QUESTIONS = 5;

function hasBrands(profile: TargetProductProfile): boolean {
  return profile.pref_brands.length > 0 || profile.avoid_brands.length > 0;
}

function hasLaptopPriority(profile: TargetProductProfile): boolean {
  if (profile.product_type !== 'laptop') return true;
  const { category_profile } = profile;
  if (!category_profile) return false;
  return Boolean(category_profile.portability_priority && category_profile.battery_priority);
}

function hasLaptopPerformanceFlags(profile: TargetProductProfile): boolean {
  if (profile.product_type !== 'laptop') return true;
  const { category_profile } = profile;
  if (!category_profile) return false;
  return Boolean(
    category_profile.needs_graphics !== undefined ||
      category_profile.needs_ai !== undefined ||
      category_profile.needs_gaming !== undefined,
  );
}

function hasPhonePriorities(profile: TargetProductProfile): boolean {
  if (profile.product_type !== 'phone') return true;
  const { category_profile } = profile;
  if (!category_profile) return false;
  return Boolean(
    category_profile.camera_priority && category_profile.battery_priority && category_profile.screen_priority,
  );
}

function hasHeadphoneIsolation(profile: TargetProductProfile): boolean {
  if (profile.product_type !== 'headphones') return true;
  const { category_profile } = profile;
  if (!category_profile) return false;
  return category_profile.anc !== undefined && category_profile.sound_isolation !== undefined;
}

function hasHeadphoneStyle(profile: TargetProductProfile): boolean {
  if (profile.product_type !== 'headphones') return true;
  const { category_profile } = profile;
  if (!category_profile) return false;
  return category_profile.latency_sensitive !== undefined && category_profile.wireless !== undefined;
}

const QUESTION_DEFINITIONS: Record<ProductType, QuestionDefinition[]> = {
  laptop: [
    {
      id: 'laptop_budget',
      category: 'laptop',
      text: 'Ngân sách dự kiến cho laptop này khoảng bao nhiêu (ví dụ: 15–25 triệu)?',
      fieldHints: ['budget_vnd'],
      isCore: true,
      shouldAsk: profile => profile.budget_vnd === null,
    },
    {
      id: 'laptop_use_case',
      category: 'laptop',
      text: 'Bạn chủ yếu dùng laptop để làm gì (học tập, văn phòng, lập trình, đồ hoạ, gaming, AI, v.v.)?',
      fieldHints: ['use_case'],
      isCore: true,
      shouldAsk: profile => !profile.use_case,
    },
    {
      id: 'laptop_brands',
      category: 'laptop',
      text: 'Có thương hiệu nào bạn muốn ưu tiên hoặc tránh không?',
      fieldHints: ['pref_brands', 'avoid_brands'],
      isCore: true,
      shouldAsk: profile => !hasBrands(profile),
    },
    {
      id: 'laptop_priority',
      category: 'laptop',
      text: 'Bạn ưu tiên hiệu năng, sự gọn nhẹ, hay thời lượng pin hơn?',
      fieldHints: ['category_profile.portability_priority', 'category_profile.battery_priority'],
      isCore: false,
      shouldAsk: profile => !hasLaptopPriority(profile),
    },
    {
      id: 'laptop_power',
      category: 'laptop',
      text: 'Bạn có cần GPU rời hoặc cấu hình mạnh cho đồ hoạ/gaming/AI không?',
      fieldHints: ['category_profile.needs_graphics', 'category_profile.needs_ai', 'category_profile.needs_gaming'],
      isCore: false,
      shouldAsk: profile => !hasLaptopPerformanceFlags(profile),
    },
  ],
  phone: [
    {
      id: 'phone_budget',
      category: 'phone',
      text: 'Ngân sách cho điện thoại bạn đang tìm là khoảng bao nhiêu (ví dụ: dưới 10 triệu, 10–15 triệu, 15–20 triệu)?',
      fieldHints: ['budget_vnd'],
      isCore: true,
      shouldAsk: profile => profile.budget_vnd === null,
    },
    {
      id: 'phone_use_case',
      category: 'phone',
      text: 'Điện thoại sẽ dùng chủ yếu cho mục đích nào (chụp ảnh, quay vlog, làm việc, gaming, pin trâu, v.v.)?',
      fieldHints: ['use_case'],
      isCore: true,
      shouldAsk: profile => !profile.use_case,
    },
    {
      id: 'phone_brands',
      category: 'phone',
      text: 'Bạn có thương hiệu nào thích hoặc muốn tránh không?',
      fieldHints: ['pref_brands', 'avoid_brands'],
      isCore: true,
      shouldAsk: profile => !hasBrands(profile),
    },
    {
      id: 'phone_priority',
      category: 'phone',
      text: 'Bạn ưu tiên điều gì hơn: camera, pin, hay màn hình?',
      fieldHints: [
        'category_profile.camera_priority',
        'category_profile.battery_priority',
        'category_profile.screen_priority',
      ],
      isCore: false,
      shouldAsk: profile => !hasPhonePriorities(profile),
    },
    {
      id: 'phone_features',
      category: 'phone',
      text: 'Bạn có cần 5G hoặc tính năng đặc biệt (chống nước, sạc nhanh) không?',
      fieldHints: ['category_profile.needs_5g', 'notes'],
      isCore: false,
      shouldAsk: profile => {
        if (profile.product_type !== 'phone') return false;
        const cp = profile.category_profile;
        return !cp || cp.needs_5g === undefined;
      },
    },
  ],
  headphones: [
    {
      id: 'headphones_budget',
      category: 'headphones',
      text: 'Ngân sách cho tai nghe này khoảng bao nhiêu (ví dụ: dưới 3 triệu, 3–5 triệu)?',
      fieldHints: ['budget_vnd'],
      isCore: true,
      shouldAsk: profile => profile.budget_vnd === null,
    },
    {
      id: 'headphones_use_case',
      category: 'headphones',
      text: 'Bạn sẽ dùng tai nghe chủ yếu trong tình huống nào (làm việc văn phòng, di chuyển, chơi game, thu âm, nghe nhạc)?',
      fieldHints: ['use_case'],
      isCore: true,
      shouldAsk: profile => !profile.use_case,
    },
    {
      id: 'headphones_brands',
      category: 'headphones',
      text: 'Có thương hiệu nào bạn thích hoặc muốn tránh không?',
      fieldHints: ['pref_brands', 'avoid_brands'],
      isCore: true,
      shouldAsk: profile => !hasBrands(profile),
    },
    {
      id: 'headphones_isolation',
      category: 'headphones',
      text: 'Bạn có cần chống ồn chủ động (ANC) hoặc khả năng cách âm tốt không?',
      fieldHints: ['category_profile.anc', 'category_profile.sound_isolation'],
      isCore: false,
      shouldAsk: profile => !hasHeadphoneIsolation(profile),
    },
    {
      id: 'headphones_style',
      category: 'headphones',
      text: 'Bạn ưu tiên tai nghe không dây, độ trễ thấp cho chơi game, hay chất âm nhạc tính hơn?',
      fieldHints: ['category_profile.latency_sensitive', 'category_profile.wireless'],
      isCore: false,
      shouldAsk: profile => !hasHeadphoneStyle(profile),
    },
  ],
  other: [],
};

export class QuestionLibrary {
  inferCategory(rawTask: string, fallback?: ProductType): ProductType {
    const normalized = rawTask.toLowerCase();
    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      if (keywords.some(keyword => normalized.includes(keyword))) {
        return category as ProductType;
      }
    }
    return fallback ?? 'laptop';
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
    }));
  }
}
