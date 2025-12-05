export type ProductType = 'laptop' | 'phone' | 'headphones' | 'other';

export type BudgetVnd =
  | number
  | {
      min: number;
      max: number;
    };

export interface BaseTargetProductProfile {
  product_type: ProductType;
  budget_vnd: BudgetVnd | null;
  use_case: string | null;
  pref_brands: string[];
  avoid_brands: string[];
  notes?: string;
}

export interface LaptopCategoryProfile {
  needs_graphics?: boolean;
  needs_gaming?: boolean;
  needs_ai?: boolean;
  needs_large_storage?: boolean;
  portability_priority?: 1 | 2 | 3 | 4 | 5;
  battery_priority?: 1 | 2 | 3 | 4 | 5;
}

export interface PhoneCategoryProfile {
  camera_priority?: 1 | 2 | 3 | 4 | 5;
  battery_priority?: 1 | 2 | 3 | 4 | 5;
  screen_priority?: 1 | 2 | 3 | 4 | 5;
  needs_5g?: boolean;
}

export interface HeadphonesCategoryProfile {
  anc?: boolean;
  sound_isolation?: 1 | 2 | 3 | 4 | 5;
  latency_sensitive?: boolean;
  wireless?: boolean;
}

export type TargetProductProfileV1 =
  | (BaseTargetProductProfile & {
      product_type: 'laptop';
      category_profile: LaptopCategoryProfile;
    })
  | (BaseTargetProductProfile & {
      product_type: 'phone';
      category_profile: PhoneCategoryProfile;
    })
  | (BaseTargetProductProfile & {
      product_type: 'headphones';
      category_profile: HeadphonesCategoryProfile;
    })
  | (BaseTargetProductProfile & {
      product_type: 'other';
      category_profile?: Record<string, unknown>;
    });

export type TargetProductProfile = TargetProductProfileV1;
