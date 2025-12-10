import type { BudgetVnd, TargetProductType, TargetProductProfile } from '@extension/shared';
import type { QuestionAnswerMap } from './types';

const BRAND_KEYWORDS: Record<string, string[]> = {
  apple: ['apple', 'iphone', 'macbook', 'ios'],
  samsung: ['samsung', 'galaxy'],
  xiaomi: ['xiaomi', 'redmi', 'mi'],
  oppo: ['oppo'],
  vivo: ['vivo'],
  realme: ['realme'],
  huawei: ['huawei'],
  dell: ['dell'],
  hp: ['hp', 'hewlett packard'],
  lenovo: ['lenovo', 'thinkpad', 'ideapad'],
  asus: ['asus', 'rog'],
  acer: ['acer'],
  msi: ['msi'],
  sony: ['sony', 'xperia'],
  bose: ['bose'],
  jbl: ['jbl'],
  sennheiser: ['sennheiser'],
  beats: ['beats'],
};

const BRAND_QUESTION_IDS = new Set(['laptop_brands', 'phone_brands', 'headphones_brands']);

const QUESTION_TEXTS: Record<string, string> = {
  laptop_budget: 'Ngân sách dự kiến cho laptop này khoảng bao nhiêu?',
  laptop_use_case: 'Bạn chủ yếu dùng laptop để làm gì?',
  laptop_priority: 'Bạn ưu tiên hiệu năng, sự gọn nhẹ, hay thời lượng pin hơn?',
  laptop_power: 'Bạn có cần GPU rời hoặc cấu hình mạnh cho đồ hoạ/gaming/AI không?',
  laptop_brands: 'Có thương hiệu nào bạn muốn ưu tiên hoặc tránh không?',

  phone_budget: 'Ngân sách cho điện thoại bạn đang tìm là khoảng bao nhiêu?',
  phone_use_case: 'Điện thoại sẽ dùng chủ yếu cho mục đích nào?',
  phone_priority: 'Bạn ưu tiên điều gì hơn: camera, pin, hay màn hình?',
  phone_features: 'Bạn có cần 5G hoặc tính năng đặc biệt (chống nước, sạc nhanh) không?',
  phone_brands: 'Bạn có thương hiệu nào thích hoặc muốn tránh không?',

  headphones_budget: 'Ngân sách cho tai nghe này khoảng bao nhiêu?',
  headphones_use_case: 'Bạn sẽ dùng tai nghe chủ yếu trong tình huống nào?',
  headphones_brands: 'Có thương hiệu nào bạn thích hoặc muốn tránh không?',
  headphones_isolation: 'Bạn có cần chống ồn chủ động (ANC) hoặc khả năng cách âm tốt không?',
  headphones_style: 'Bạn ưu tiên tai nghe không dây, độ trễ thấp cho chơi game, hay chất âm nhạc tính hơn?',

  task_brands: 'Yêu cầu ban đầu có nêu thương hiệu cần ưu tiên hoặc tránh không?',
};

const OPT_OUT_MARKERS = [
  'không quan trọng',
  'ko quan trọng',
  'khong quan trong',
  'không cần',
  'ko cần',
  'khong can',
  'không rõ',
  'không chắc',
  'chưa rõ',
  'chưa biết',
  'chua biet',
  'tùy',
  'tuỳ',
  'tuy',
  'sao cũng được',
  'sao cung duoc',
  'gì cũng được',
  'gi cung duoc',
  'any',
  'no preference',
] as const;

const includesAny = (value: string, keywords: string[]): boolean => keywords.some(keyword => value.includes(keyword));

// 1. Từ điển quy đổi "Slang" sang hệ số nhân
const UNIT_MULTIPLIERS: Record<string, number> = {
  // Tỷ
  tỷ: 1_000_000_000,
  tỏi: 1_000_000_000,
  b: 1_000_000_000,
  // Triệu
  triệu: 1_000_000,
  tr: 1_000_000,
  củ: 1_000_000,
  chai: 1_000_000,
  m: 1_000_000,
  // Trăm nghìn (Slang)
  lít: 100_000,
  xị: 100_000,
  // Nghìn
  ngàn: 1_000,
  nghìn: 1_000,
  k: 1_000,
  cành: 1_000,
  ka: 1_000,
  // Mặc định
  đ: 1,
  vnd: 1,
  đồng: 1,
};

// Regex để bắt pattern: 15tr5, 20m5 -> chuyển thành 15.5tr, 20.5m
// Group 1: Số nguyên, Group 2: Đơn vị (tr/m/củ...), Group 3: Phần thập phân viết liền
const COMPACT_DECIMAL_REGEX = /(\d+)\s*(tr|m|củ|chai|k|ngàn)\s*(\d+)/gi;

function normalizeBudgetInput(input: string): string {
  let normalized = input.toLowerCase().trim();

  // Bước 1: Xử lý "rưỡi" -> ".5" (Ví dụ: 15 triệu rưỡi -> 15.5 triệu)
  normalized = normalized.replace(/\s+rưỡi/g, '.5');

  // Bước 2: Chuẩn hóa dấu phẩy thành chấm cho số thập phân
  normalized = normalized.replace(/,/g, '.');

  // Bước 3: Xử lý các case viết liền kiểu "15tr5" -> "15.5tr"
  // Logic: Nếu sau đơn vị là số, ta coi đó là phần thập phân
  normalized = normalized.replace(COMPACT_DECIMAL_REGEX, (match, p1, unit, p2) => {
    // Nếu p2 là "5" -> .5, nếu là "50" -> .5, nếu "05" -> .05
    // Để đơn giản cho văn nói: "15tr5" thường là 15.5
    return `${p1}.${p2} ${unit}`;
  });

  return normalized;
}

function parseBudget(answer: string): BudgetVnd | null {
  const cleanedInput = normalizeBudgetInput(answer);

  // Regex bắt cặp: [Số] + [Khoảng trắng tùy ý] + [Đơn vị từ lóng (optional)]
  // Matches: "15.5 củ", "500 k", "20", "1 tỏi"
  const valueRegex = /(\d+(?:\.\d+)?)\s*([a-zà-ỹ]+)?/gi;

  const values: number[] = [];
  let match;

  while ((match = valueRegex.exec(cleanedInput)) !== null) {
    const numStr = match[1];
    const unitStr = match[2];

    let value = parseFloat(numStr);

    // Bỏ qua nếu parse lỗi hoặc bằng 0 (trừ khi free, nhưng budget hiếm khi free)
    if (isNaN(value) || value <= 0) continue;

    if (unitStr && UNIT_MULTIPLIERS[unitStr]) {
      // Case 1: Có đơn vị rõ ràng (Ví dụ: 15 củ)
      value *= UNIT_MULTIPLIERS[unitStr];
    } else {
      // Case 2: Không có đơn vị (Ví dụ: "tầm 15 20")
      // Áp dụng Heuristic (Đoán):
      // - Nếu < 200: Khả năng cao là TRIỆU (Laptop/Phone hiếm khi < 200 VND hay 200k mà viết trọc lóc)
      // - Nếu > 1000: Khả năng cao là VND (hoặc K nếu người dùng lười)
      // Để an toàn cho ngữ cảnh Laptop/Phone:
      if (value < 500) {
        value *= 1_000_000; // Đoán là triệu
      } else if (value < 1_000_000) {
        value *= 1_000; // Đoán là nghìn (K)
      }
      // Nếu > 1 triệu thì giữ nguyên (người dùng nhập full số 20000000)
    }

    values.push(value);
  }

  if (values.length === 0) return null;

  // Sắp xếp lại để đảm bảo min < max
  values.sort((a, b) => a - b);

  // Logic lọc nhiễu (loại bỏ các số quá nhỏ vô lý nếu đã có số lớn hợp lý)
  // Ví dụ: "15 triệu, bảo hành 12 tháng" -> bắt được 15tr và 12.
  // 12 ở đây (sau khi heuristic nhân triệu) có thể thành 12tr -> Gây hiểu nhầm là range 12-15tr.
  // Tuy nhiên, ở level regex đơn giản, ta chấp nhận lấy Min-Max của tất cả các số tìm thấy.

  if (values.length === 1) {
    // Nếu chỉ có 1 số, tạo khoảng mềm (ví dụ +/- 20% hoặc Min = số đó)
    // Nhưng theo interface BudgetVnd cũ, nếu trả về number là fixed budget, object là range.
    return Math.round(values[0]);
  }

  return {
    min: Math.round(values[0]),
    max: Math.round(values[values.length - 1]),
  };
}

function cleanAndSplit(text: string): string[] {
  const cleaned = text
    .replace(/(hãng|brand|thương hiệu|ưu tiên|tránh|không thích)/gi, '')
    .replace(/:+/g, ' ')
    .replace(/[.?]/g, ' ')
    .toLowerCase();

  const tokens = cleaned.split(/[,/]| và | hoặc |\/|-/).map(token => token.trim());
  return tokens.filter(token => token.length > 0 && token !== 'không' && token !== 'ko');
}

function extractBrandsFromUnstructuredText(answer: string): { pref: string[]; avoid: string[] } {
  const lower = answer.toLowerCase();
  if (lower.includes('không') || lower.includes('ko') || lower.includes('tránh')) {
    const parts = answer.split(/(tránh|không thích|không muốn)/i);
    if (parts.length >= 2) {
      const pref = cleanAndSplit(parts[0]);
      const avoid = cleanAndSplit(parts.slice(1).join(' '));
      return { pref, avoid };
    }
  }
  return { pref: cleanAndSplit(answer), avoid: [] };
}

function parseStructuredBrandAnswer(answer: string): { pref: string; avoid: string } | null {
  if (!answer.trim().startsWith('{')) return null;
  try {
    const parsed = JSON.parse(answer);
    if (parsed && typeof parsed === 'object') {
      return {
        pref: typeof parsed.pref === 'string' ? parsed.pref : '',
        avoid: typeof parsed.avoid === 'string' ? parsed.avoid : '',
      };
    }
  } catch {
    return null;
  }
  return null;
}

export class ProfileParser {
  createBaseProfile(productType: TargetProductType): TargetProductProfile {
    return {
      product_type: productType,
      budget_vnd: null,
      pref_brands: [],
      avoid_brands: [],
      requirements_context: [],
      clarification_opt_outs: {},
    };
  }

  mergeOverrides(profile: TargetProductProfile, overrides?: Partial<TargetProductProfile>): TargetProductProfile {
    if (!overrides) return profile;

    const merged: TargetProductProfile = { ...profile };

    if (overrides.product_type && overrides.product_type !== merged.product_type) {
      merged.product_type = overrides.product_type;
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
    if (overrides.notes !== undefined) {
      merged.notes = overrides.notes;
    }
    if (overrides.requirements_context !== undefined) {
      // Merge unique requirements strings
      const existing = new Set(merged.requirements_context);
      overrides.requirements_context.forEach(req => existing.add(req));
      merged.requirements_context = Array.from(existing);
    }
    if (overrides.clarification_opt_outs) {
      merged.clarification_opt_outs = {
        ...(merged.clarification_opt_outs ?? {}),
        ...overrides.clarification_opt_outs,
      };
    }

    return merged;
  }

  async autoExtractFromTask(task: string): Promise<Partial<TargetProductProfile>> {
    const normalized = task.toLowerCase();
    if (!normalized.trim()) {
      return {};
    }

    const extracted: Partial<TargetProductProfile> = {
      requirements_context: [task], // Initial context is the raw task
    };

    // 1. Auto-extract Brands (Simple Keyword Match)
    const detectedBrands = new Set<string>();
    for (const [brand, keywords] of Object.entries(BRAND_KEYWORDS)) {
      if (includesAny(normalized, keywords)) {
        detectedBrands.add(brand);
      }
    }
    if (detectedBrands.size > 0) {
      extracted.pref_brands = Array.from(detectedBrands);
    }

    // 2. Auto-extract Budget
    const parsedBudget = parseBudget(task);
    if (parsedBudget) {
      extracted.budget_vnd = parsedBudget;
    }

    return extracted;
  }

  async applyAnswers(profile: TargetProductProfile, answers: QuestionAnswerMap): Promise<TargetProductProfile> {
    // Preserve immutability: create shallow copy at start to avoid mutating caller's input
    let updated = { ...profile };
    for (const [questionId, answer] of Object.entries(answers)) {
      if (!answer.trim()) continue;
      updated = await this.applyAnswer(updated, questionId, answer);
    }
    return updated;
  }

  private async applyAnswer(
    profile: TargetProductProfile,
    questionId: string,
    answer: string,
  ): Promise<TargetProductProfile> {
    if (this.isOptOutAnswer(answer)) {
      return this.applyOptOut(profile, questionId);
    }

    const workingProfile = this.clearOptOut(profile, questionId);
    let nextProfile = { ...workingProfile };

    // 1. Update Hard Constraints if applicable
    switch (questionId) {
      case 'laptop_budget':
      case 'phone_budget':
      case 'headphones_budget':
        nextProfile = this.applyBudget(nextProfile, answer);
        break;
      case 'laptop_brands':
      case 'phone_brands':
      case 'headphones_brands':
        nextProfile = this.applyBrands(nextProfile, answer);
        break;
      default:
        // No hard constraint update for other questions
        break;
    }

    // 2. Always append to context
    const questionText = QUESTION_TEXTS[questionId] || questionId;
    let entry = `${questionText} -> ${answer}`;

    // For brands, we might want to log the specific interpretation if it was split
    if (BRAND_QUESTION_IDS.has(questionId)) {
      const structured = parseStructuredBrandAnswer(answer);
      if (structured) {
        entry = `${questionText} -> Ưu tiên: ${structured.pref}, Tránh: ${structured.avoid}`;
      } else {
        entry = `${questionText} -> ${answer}`;
      }
    }

    nextProfile = {
      ...nextProfile,
      requirements_context: [...(nextProfile.requirements_context || []), entry],
      clarification_opt_outs: {
        ...(nextProfile.clarification_opt_outs ?? {}),
        [questionId]: true,
      },
    };

    return nextProfile;
  }

  private applyBudget(profile: TargetProductProfile, answer: string): TargetProductProfile {
    const parsed = parseBudget(answer);
    if (!parsed) return profile;
    return { ...profile, budget_vnd: parsed };
  }

  private applyBrands(profile: TargetProductProfile, answer: string): TargetProductProfile {
    // 1. Try structured parsing first (Direct Mapping)
    const structured = parseStructuredBrandAnswer(answer);
    if (structured) {
      return {
        ...profile,
        pref_brands: cleanAndSplit(structured.pref),
        avoid_brands: cleanAndSplit(structured.avoid),
      };
    }

    // 2. Fallback to unstructured extraction (Heuristics)
    const extracted = extractBrandsFromUnstructuredText(answer);
    return {
      ...profile,
      pref_brands: extracted.pref.length > 0 ? extracted.pref : profile.pref_brands,
      avoid_brands: extracted.avoid.length > 0 ? extracted.avoid : profile.avoid_brands,
    };
  }

  private isOptOutAnswer(answer: string): boolean {
    const normalized = answer.trim().toLowerCase();
    if (!normalized) {
      return false;
    }
    return OPT_OUT_MARKERS.some(marker => normalized === marker || normalized.startsWith(`${marker} `));
  }

  private applyOptOut(profile: TargetProductProfile, questionId: string): TargetProductProfile {
    const next = {
      ...profile,
      clarification_opt_outs: {
        ...(profile.clarification_opt_outs ?? {}),
        [questionId]: true,
      },
    };
    return next;
  }

  private clearOptOut(profile: TargetProductProfile, questionId: string): TargetProductProfile {
    const current = profile.clarification_opt_outs;
    if (!current?.[questionId]) {
      return profile;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { [questionId]: _removed, ...rest } = current;
    // @ts-expect-error: rest matches Record<string, boolean>
    return {
      ...profile,
      clarification_opt_outs: rest,
    };
  }
}
