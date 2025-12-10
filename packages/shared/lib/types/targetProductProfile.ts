export type TargetProductType = 'laptop' | 'phone' | 'headphones' | 'other';

export type BudgetVnd =
  | number
  | {
      min: number;
      max: number;
    };

export interface TargetProductProfile {
  product_type: TargetProductType;
  budget_vnd: BudgetVnd | null;
  pref_brands: string[];
  avoid_brands: string[];
  /**
   * A chronological log of every relevant requirement or context provided by the user.
   * This replaces granular fields like `use_case`, `battery_priority`, etc.
   */
  requirements_context: string[];
  clarification_opt_outs: Record<string, boolean>;
  notes?: string;
}
