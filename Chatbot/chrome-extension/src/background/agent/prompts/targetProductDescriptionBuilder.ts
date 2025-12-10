import type { TargetProductProfile } from '@extension/shared';

const PREFERRED_SITES = ['https://shopee.vn/', 'https://cellphones.com.vn/', 'https://fptshop.com.vn/'];

export class TargetProductDescriptionBuilder {
  build(profile: TargetProductProfile): string {
    const lines: string[] = [
      `Loại sản phẩm: ${profile.product_type}`,
      `Ngân sách: ${this.formatBudget(profile.budget_vnd)}`,
      this.formatBrandPreference(profile),
      this.formatNotes(profile),
      'Context & Requirements History:',
      ...this.formatRequirementsContext(profile),
      '',
      `Trang web cần duyệt: ${PREFERRED_SITES.join(', ')}`,
    ];

    return lines.filter(line => line.length > 0).join('\n');
  }

  private formatBudget(budget: TargetProductProfile['budget_vnd']): string {
    if (!budget) return 'Chưa rõ';
    if (typeof budget === 'number') {
      return `${budget.toLocaleString('vi-VN')} VND`;
    }
    return `${budget.min.toLocaleString('vi-VN')} – ${budget.max.toLocaleString('vi-VN')} VND`;
  }

  private formatBrandPreference(profile: TargetProductProfile): string {
    if (profile.pref_brands.length === 0 && profile.avoid_brands.length === 0) {
      return 'Thương hiệu: Chưa rõ / Không yêu cầu cụ thể';
    }
    return `Thương hiệu: Ưu tiên [${profile.pref_brands.join(', ')}] | Tránh [${profile.avoid_brands.join(', ')}]`;
  }

  private formatNotes(profile: TargetProductProfile): string {
    return profile.notes ? `Ghi chú thêm: ${profile.notes}` : '';
  }

  private formatRequirementsContext(profile: TargetProductProfile): string[] {
    if (!profile.requirements_context || profile.requirements_context.length === 0) {
      return ['- (No specific context provided)'];
    }
    return profile.requirements_context.map(req => `- ${req}`);
  }
}
