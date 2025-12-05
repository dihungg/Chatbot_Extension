import type {
  HeadphonesCategoryProfile,
  LaptopCategoryProfile,
  PhoneCategoryProfile,
  TargetProductProfile,
} from '@extension/shared';

const PREFERRED_SITES = ['https://shopee.vn/', 'https://cellphones.com.vn/', 'https://fptshop.com.vn/'];

export class TargetProductDescriptionBuilder {
  build(profile: TargetProductProfile): string {
    const lines: string[] = [
      `Loại sản phẩm: ${profile.product_type}`,
      `Mục tiêu người dùng: ${profile.use_case ?? 'Chưa rõ'}`,
      `Ngân sách: ${this.formatBudget(profile.budget_vnd)}`,
      'Yêu cầu tối thiểu:',
      ...this.buildRequirements(profile),
      'Ưu tiên mềm:',
      ...this.buildSoftPreferences(profile),
      `Trang web cần duyệt: ${PREFERRED_SITES.join(', ')}`,
    ];

    return lines.join('\n');
  }

  private formatBudget(budget: TargetProductProfile['budget_vnd']): string {
    if (!budget) return 'Chưa rõ';
    if (typeof budget === 'number') {
      return `${budget.toLocaleString('vi-VN')} VND`;
    }
    return `${budget.min.toLocaleString('vi-VN')} – ${budget.max.toLocaleString('vi-VN')} VND`;
  }

  private buildRequirements(profile: TargetProductProfile): string[] {
    switch (profile.product_type) {
      case 'laptop':
        return this.describeLaptopRequirements(profile.category_profile as LaptopCategoryProfile);
      case 'phone':
        return this.describePhoneRequirements(profile.category_profile as PhoneCategoryProfile);
      case 'headphones':
        return this.describeHeadphoneRequirements(profile.category_profile as HeadphonesCategoryProfile);
      default:
        return ['- Chưa có yêu cầu cụ thể'];
    }
  }

  private buildSoftPreferences(profile: TargetProductProfile): string[] {
    const brandPreference =
      profile.pref_brands.length > 0 || profile.avoid_brands.length > 0
        ? `- Thương hiệu: Ưu tiên ${profile.pref_brands.join(', ') || 'không'} | Tránh ${
            profile.avoid_brands.join(', ') || 'không'
          }`
        : '- Thương hiệu: chưa rõ';

    switch (profile.product_type) {
      case 'laptop':
        return [brandPreference, ...this.describeLaptopPreferences(profile.category_profile as LaptopCategoryProfile)];
      case 'phone':
        return [brandPreference, ...this.describePhonePreferences(profile.category_profile as PhoneCategoryProfile)];
      case 'headphones':
        return [
          brandPreference,
          ...this.describeHeadphonePreferences(profile.category_profile as HeadphonesCategoryProfile),
        ];
      default:
        return [brandPreference];
    }
  }

  private describeLaptopRequirements(categoryProfile: LaptopCategoryProfile | undefined): string[] {
    if (!categoryProfile) return ['- Không có yêu cầu phần cứng đặc biệt'];
    const lines: string[] = [];
    if (categoryProfile.needs_graphics) {
      lines.push('- Cần GPU rời hoặc chip đồ hoạ mạnh cho thiết kế / dựng hình');
    }
    if (categoryProfile.needs_gaming) {
      lines.push('- Ưu tiên cấu hình chơi game ổn định (CPU H-series, GPU RTX trở lên)');
    }
    if (categoryProfile.needs_ai) {
      lines.push('- Phù hợp chạy AI/ML nội suy (GPU VRAM ≥ 8 GB)');
    }
    if (categoryProfile.needs_large_storage) {
      lines.push('- Bộ nhớ lớn (≥1 TB SSD)');
    }
    return lines.length > 0 ? lines : ['- Không có yêu cầu phần cứng đặc biệt'];
  }

  private describeLaptopPreferences(categoryProfile: LaptopCategoryProfile | undefined): string[] {
    if (!categoryProfile) return ['- Ưu tiên cân bằng hiệu năng và tính di động'];
    const lines: string[] = [];
    if (categoryProfile.portability_priority) {
      lines.push(`- Ưu tiên gọn nhẹ ở mức ${categoryProfile.portability_priority}/5`);
    }
    if (categoryProfile.battery_priority) {
      lines.push(`- Ưu tiên pin ở mức ${categoryProfile.battery_priority}/5`);
    }
    if (lines.length === 0) {
      lines.push('- Ưu tiên cân bằng hiệu năng và tính di động');
    }
    return lines;
  }

  private describePhoneRequirements(categoryProfile: PhoneCategoryProfile | undefined): string[] {
    if (!categoryProfile) return ['- Không có yêu cầu phần cứng đặc biệt'];
    const lines: string[] = [];
    if (categoryProfile.camera_priority) {
      lines.push(`- Camera là ưu tiên ${categoryProfile.camera_priority}/5`);
    }
    if (categoryProfile.battery_priority) {
      lines.push(`- Pin là ưu tiên ${categoryProfile.battery_priority}/5`);
    }
    if (categoryProfile.screen_priority) {
      lines.push(`- Màn hình là ưu tiên ${categoryProfile.screen_priority}/5`);
    }
    return lines.length > 0 ? lines : ['- Không có yêu cầu phần cứng đặc biệt'];
  }

  private describePhonePreferences(categoryProfile: PhoneCategoryProfile | undefined): string[] {
    if (!categoryProfile) return ['- Ưu tiên cân bằng trải nghiệm tổng thể'];
    const lines: string[] = [];
    if (categoryProfile.needs_5g !== undefined) {
      lines.push(`- ${categoryProfile.needs_5g ? 'Yêu cầu' : 'Không bắt buộc'} 5G`);
    }
    return lines.length > 0 ? lines : ['- Ưu tiên cân bằng trải nghiệm tổng thể'];
  }

  private describeHeadphoneRequirements(categoryProfile: HeadphonesCategoryProfile | undefined): string[] {
    if (!categoryProfile) return ['- Không có yêu cầu kỹ thuật đặc biệt'];
    const lines: string[] = [];
    if (categoryProfile.anc !== undefined) {
      lines.push(`- ${categoryProfile.anc ? 'Cần' : 'Không cần'} chống ồn chủ động`);
    }
    if (categoryProfile.sound_isolation !== undefined) {
      lines.push(`- Mức cách âm kỳ vọng: ${categoryProfile.sound_isolation}/5`);
    }
    return lines.length > 0 ? lines : ['- Không có yêu cầu kỹ thuật đặc biệt'];
  }

  private describeHeadphonePreferences(categoryProfile: HeadphonesCategoryProfile | undefined): string[] {
    if (!categoryProfile) return ['- Ưu tiên cân bằng giữa độ trễ và chất âm'];
    const lines: string[] = [];
    if (categoryProfile.wireless !== undefined) {
      lines.push(`- ${categoryProfile.wireless ? 'Ưu tiên' : 'Không cần'} tai nghe không dây`);
    }
    if (categoryProfile.latency_sensitive !== undefined) {
      lines.push(`- Độ trễ thấp: ${categoryProfile.latency_sensitive ? 'Cần cho gaming' : 'Không bắt buộc'}`);
    }
    return lines.length > 0 ? lines : ['- Ưu tiên cân bằng giữa độ trễ và chất âm'];
  }
}
