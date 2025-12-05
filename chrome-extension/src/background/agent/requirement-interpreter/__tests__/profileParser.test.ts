import { describe, expect, it } from 'vitest';
import { ProfileParser } from '../profileParser';

describe('ProfileParser', () => {
  const parser = new ProfileParser();

  it('parses budget range with triệu keyword', () => {
    const profile = parser.createBaseProfile('laptop');
    const updated = parser.applyAnswers(profile, {
      laptop_budget: 'Tầm 18-22 triệu',
    });
    expect(updated.budget_vnd).toEqual({
      min: 18_000_000,
      max: 22_000_000,
    });
  });

  it('parses brand preferences into pref and avoid arrays', () => {
    const profile = parser.createBaseProfile('phone');
    const updated = parser.applyAnswers(profile, {
      phone_brands: 'Ưu tiên Samsung, tránh Realme',
    });
    expect(updated.pref_brands).toContain('samsung');
    expect(updated.avoid_brands).toContain('realme');
  });

  it('sets laptop performance flags when answer mentions GPU and AI', () => {
    const profile = parser.createBaseProfile('laptop');
    const updated = parser.applyAnswers(profile, {
      laptop_power: 'Cần GPU rời để làm đồ hoạ và chạy AI cơ bản',
    });
    expect(updated.product_type).toBe('laptop');
    if (updated.product_type !== 'laptop') {
      throw new Error('Expected laptop profile');
    }
    const cat = updated.category_profile;
    expect(cat.needs_graphics).toBe(true);
    expect(cat.needs_ai).toBe(true);
  });
});
