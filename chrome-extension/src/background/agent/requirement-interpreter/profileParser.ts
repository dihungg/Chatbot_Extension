import type {
  BudgetVnd,
  HeadphonesCategoryProfile,
  LaptopCategoryProfile,
  PhoneCategoryProfile,
  ProductType,
  TargetProductProfile,
} from '@extension/shared';
import type { QuestionAnswerMap } from './types';

function extractNumbers(answer: string): number[] {
  const normalized = answer.toLowerCase().replace(/,/g, '.');
  const matches = normalized.match(/(\d+(?:\.\d+)?)/g);
  if (!matches) return [];
  return matches.map(num => parseFloat(num));
}

function parseBudget(answer: string): BudgetVnd | null {
  const numbers = extractNumbers(answer);
  if (numbers.length === 0) {
    return null;
  }

  const containsMillion = /triệu/.test(answer.toLowerCase());
  const multiplier = containsMillion ? 1_000_000 : answer.includes('k') ? 1_000 : 1;

  if (numbers.length === 1) {
    return Math.round(numbers[0] * multiplier);
  }

  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  return {
    min: Math.round(min * multiplier),
    max: Math.round(max * multiplier),
  };
}

function parseBrandList(answer: string): string[] {
  const cleaned = answer
    .replace(/(hãng|brand|thương hiệu|ưu tiên|tránh|không thích)/gi, '')
    .replace(/:+/g, ' ')
    .replace(/[\.\?]/g, ' ')
    .toLowerCase();

  const tokens = cleaned.split(/[,/]| và | hoặc |\/|-/).map(token => token.trim());
  return tokens.filter(token => token.length > 0 && token !== 'không' && token !== 'ko');
}

function deriveBrandPreferences(answer: string): { pref: string[]; avoid: string[] } {
  const lower = answer.toLowerCase();
  if (lower.includes('không') || lower.includes('ko') || lower.includes('tránh')) {
    const parts = answer.split(/(tránh|không thích|không muốn)/i);
    if (parts.length >= 2) {
      const pref = parseBrandList(parts[0]);
      const avoid = parseBrandList(parts.slice(1).join(' '));
      return { pref, avoid };
    }
  }
  return { pref: parseBrandList(answer), avoid: [] };
}

function scoreFromKeywords(answer: string, keywords: string[]): number | undefined {
  const lower = answer.toLowerCase();
  if (keywords.some(keyword => lower.includes(keyword))) {
    return 5;
  }
  return undefined;
}

function boolFromAnswer(answer: string, positiveKeywords: string[]): boolean | undefined {
  const lower = answer.toLowerCase();
  if (positiveKeywords.some(keyword => lower.includes(keyword))) {
    return true;
  }
  if (lower.includes('không') || lower.includes('ko') || lower.includes('khong')) {
    return false;
  }
  return undefined;
}

function normalizeUseCase(answer: string): string {
  return answer.trim();
}

function clampPriority(value: number | undefined): 1 | 2 | 3 | 4 | 5 | undefined {
  if (value === undefined) return undefined;
  const clamped = Math.min(5, Math.max(1, Math.round(value)));
  return clamped as 1 | 2 | 3 | 4 | 5;
}

function ensureLaptopProfile(): LaptopCategoryProfile {
  return {};
}

function ensurePhoneProfile(): PhoneCategoryProfile {
  return {};
}

function ensureHeadphonesProfile(): HeadphonesCategoryProfile {
  return {};
}

export class ProfileParser {
  createBaseProfile(productType: ProductType): TargetProductProfile {
    const base = {
      product_type: productType,
      budget_vnd: null,
      use_case: null,
      pref_brands: [],
      avoid_brands: [],
      category_profile: this.createCategoryProfile(productType),
    } as TargetProductProfile;
    return base;
  }

  mergeOverrides(profile: TargetProductProfile, overrides?: Partial<TargetProductProfile>): TargetProductProfile {
    if (!overrides) return profile;

    const merged: TargetProductProfile = { ...profile };

    if (overrides.product_type && overrides.product_type !== merged.product_type) {
      merged.product_type = overrides.product_type;
      merged.category_profile = this.createCategoryProfile(overrides.product_type);
    }

    if (overrides.pref_brands !== undefined) {
      merged.pref_brands = overrides.pref_brands;
    }
    if (overrides.avoid_brands !== undefined) {
      merged.avoid_brands = overrides.avoid_brands;
    }
    if (overrides.budget_vnd !== undefined) {
      merged.budget_vnd = overrides.budget_vnd;
    }
    if (overrides.use_case !== undefined) {
      merged.use_case = overrides.use_case;
    }
    if (overrides.notes !== undefined) {
      merged.notes = overrides.notes;
    }

    if (overrides.category_profile) {
      merged.category_profile = this.mergeCategoryProfile(
        merged.product_type,
        merged.category_profile,
        overrides.category_profile,
      );
    }

    return merged;
  }

  applyAnswers(profile: TargetProductProfile, answers: QuestionAnswerMap): TargetProductProfile {
    let updated = { ...profile };
    for (const [questionId, answer] of Object.entries(answers)) {
      if (!answer.trim()) continue;
      updated = this.applyAnswer(updated, questionId, answer);
    }
    return updated;
  }

  private applyAnswer(profile: TargetProductProfile, questionId: string, answer: string): TargetProductProfile {
    switch (questionId) {
      case 'laptop_budget':
      case 'phone_budget':
      case 'headphones_budget':
        return this.applyBudget(profile, answer);
      case 'laptop_use_case':
      case 'phone_use_case':
      case 'headphones_use_case':
        return { ...profile, use_case: normalizeUseCase(answer) };
      case 'laptop_brands':
      case 'phone_brands':
      case 'headphones_brands':
        return this.applyBrands(profile, answer);
      case 'laptop_priority':
        return this.applyLaptopPriority(profile, answer);
      case 'laptop_power':
        return this.applyLaptopPower(profile, answer);
      case 'phone_priority':
        return this.applyPhonePriority(profile, answer);
      case 'phone_features':
        return this.applyPhoneFeatures(profile, answer);
      case 'headphones_isolation':
        return this.applyHeadphoneIsolation(profile, answer);
      case 'headphones_style':
        return this.applyHeadphoneStyle(profile, answer);
      default:
        return profile;
    }
  }

  private applyBudget(profile: TargetProductProfile, answer: string): TargetProductProfile {
    const parsed = parseBudget(answer);
    if (!parsed) return profile;
    return { ...profile, budget_vnd: parsed };
  }

  private applyBrands(profile: TargetProductProfile, answer: string): TargetProductProfile {
    const { pref, avoid } = deriveBrandPreferences(answer);
    return {
      ...profile,
      pref_brands: pref.length > 0 ? pref : profile.pref_brands,
      avoid_brands: avoid.length > 0 ? avoid : profile.avoid_brands,
    };
  }

  private applyLaptopPriority(profile: TargetProductProfile, answer: string): TargetProductProfile {
    if (profile.product_type !== 'laptop') return profile;
    const categoryProfile = (profile.category_profile ?? ensureLaptopProfile()) as LaptopCategoryProfile;
    const lower = answer.toLowerCase();
    if (lower.includes('gọn') || lower.includes('nhẹ')) {
      categoryProfile.portability_priority = 5;
    }
    if (lower.includes('pin')) {
      categoryProfile.battery_priority = 5;
    }
    if (lower.includes('hiệu năng') || lower.includes('performance')) {
      categoryProfile.portability_priority = categoryProfile.portability_priority ?? 3;
      categoryProfile.battery_priority = categoryProfile.battery_priority ?? 3;
    }
    return {
      ...profile,
      category_profile: categoryProfile,
    };
  }

  private applyLaptopPower(profile: TargetProductProfile, answer: string): TargetProductProfile {
    if (profile.product_type !== 'laptop') return profile;
    const categoryProfile = (profile.category_profile ?? ensureLaptopProfile()) as LaptopCategoryProfile;
    const lower = answer.toLowerCase();
    const needsGraphics = boolFromAnswer(lower, ['gpu', 'đồ hoạ', 'đồ họa', 'graphic']);
    if (needsGraphics !== undefined) {
      categoryProfile.needs_graphics = needsGraphics;
    }
    const needsGaming = boolFromAnswer(lower, ['game', 'gaming', 'esport']);
    if (needsGaming !== undefined) {
      categoryProfile.needs_gaming = needsGaming;
    }
    const needsAi = boolFromAnswer(lower, ['ai', 'machine learning', 'deep learning']);
    if (needsAi !== undefined) {
      categoryProfile.needs_ai = needsAi;
    }
    return {
      ...profile,
      category_profile: categoryProfile,
    };
  }

  private applyPhonePriority(profile: TargetProductProfile, answer: string): TargetProductProfile {
    if (profile.product_type !== 'phone') return profile;
    const categoryProfile = (profile.category_profile ?? ensurePhoneProfile()) as PhoneCategoryProfile;
    const cameraScore = scoreFromKeywords(answer, ['camera', 'ảnh', 'quay vlog']);
    const batteryScore = scoreFromKeywords(answer, ['pin', 'sạc', 'on-screen']);
    const screenScore = scoreFromKeywords(answer, ['màn hình', 'display', 'oled']);
    if (cameraScore !== undefined) {
      categoryProfile.camera_priority = clampPriority(cameraScore);
    }
    if (batteryScore !== undefined) {
      categoryProfile.battery_priority = clampPriority(batteryScore);
    }
    if (screenScore !== undefined) {
      categoryProfile.screen_priority = clampPriority(screenScore);
    }
    return {
      ...profile,
      category_profile: categoryProfile,
    };
  }

  private applyPhoneFeatures(profile: TargetProductProfile, answer: string): TargetProductProfile {
    if (profile.product_type !== 'phone') return profile;
    const categoryProfile = (profile.category_profile ?? ensurePhoneProfile()) as PhoneCategoryProfile;
    const needs5G = boolFromAnswer(answer, ['5g']);
    if (needs5G !== undefined) {
      categoryProfile.needs_5g = needs5G;
    }
    const notes = answer.toLowerCase().includes('chống nước') ? 'Cần chống nước' : undefined;
    return {
      ...profile,
      category_profile: categoryProfile,
      notes: notes ?? profile.notes,
    };
  }

  private applyHeadphoneIsolation(profile: TargetProductProfile, answer: string): TargetProductProfile {
    if (profile.product_type !== 'headphones') return profile;
    const categoryProfile = (profile.category_profile ?? ensureHeadphonesProfile()) as HeadphonesCategoryProfile;
    const anc = boolFromAnswer(answer, ['anc', 'chống ồn', 'chong on']);
    if (anc !== undefined) {
      categoryProfile.anc = anc;
      categoryProfile.sound_isolation = anc ? 5 : 2;
    }
    return {
      ...profile,
      category_profile: categoryProfile,
    };
  }

  private applyHeadphoneStyle(profile: TargetProductProfile, answer: string): TargetProductProfile {
    if (profile.product_type !== 'headphones') return profile;
    const categoryProfile = (profile.category_profile ?? ensureHeadphonesProfile()) as HeadphonesCategoryProfile;
    const wantsWireless = boolFromAnswer(answer, ['không dây', 'wireless', 'bluetooth']);
    if (wantsWireless !== undefined) {
      categoryProfile.wireless = wantsWireless;
    }
    const latencySensitive = boolFromAnswer(answer, ['độ trễ thấp', 'gaming', 'game']);
    if (latencySensitive !== undefined) {
      categoryProfile.latency_sensitive = latencySensitive;
    }
    return {
      ...profile,
      category_profile: categoryProfile,
    };
  }

  private createCategoryProfile(productType: ProductType) {
    switch (productType) {
      case 'laptop':
        return ensureLaptopProfile();
      case 'phone':
        return ensurePhoneProfile();
      case 'headphones':
        return ensureHeadphonesProfile();
      default:
        return {};
    }
  }

  private mergeCategoryProfile(
    productType: ProductType,
    current: TargetProductProfile['category_profile'],
    overrides: NonNullable<TargetProductProfile['category_profile']>,
  ) {
    switch (productType) {
      case 'laptop': {
        const base = (current ?? ensureLaptopProfile()) as LaptopCategoryProfile;
        return {
          ...base,
          ...(overrides as LaptopCategoryProfile),
        };
      }
      case 'phone': {
        const base = (current ?? ensurePhoneProfile()) as PhoneCategoryProfile;
        return {
          ...base,
          ...(overrides as PhoneCategoryProfile),
        };
      }
      case 'headphones': {
        const base = (current ?? ensureHeadphonesProfile()) as HeadphonesCategoryProfile;
        return {
          ...base,
          ...(overrides as HeadphonesCategoryProfile),
        };
      }
      default: {
        return {
          ...(current ?? {}),
          ...overrides,
        };
      }
    }
  }
}
