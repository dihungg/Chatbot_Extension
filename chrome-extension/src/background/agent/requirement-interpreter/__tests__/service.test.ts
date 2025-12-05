import { describe, expect, it } from 'vitest';
import type { TargetProductProfileRepository, TargetProductProfile } from '@extension/storage';
import { RequirementInterpreterService } from '../service';

class InMemoryRepository implements TargetProductProfileRepository {
  private readonly store = new Map<string, TargetProductProfile>();

  async get(sessionId: string): Promise<TargetProductProfile | null> {
    return this.store.get(sessionId) ?? null;
  }

  async set(sessionId: string, profile: TargetProductProfile): Promise<void> {
    this.store.set(sessionId, profile);
  }

  async clear(sessionId: string): Promise<void> {
    this.store.delete(sessionId);
  }

  async clearAll(): Promise<void> {
    this.store.clear();
  }
}

describe('RequirementInterpreterService', () => {
  it('requests clarification and finalizes profile after answers', async () => {
    const repository = new InMemoryRepository();
    const service = new RequirementInterpreterService({ repository });
    const sessionId = 'session-1';

    const initial = await service.ensureProfile(sessionId, 'Tôi muốn mua laptop học tập và thỉnh thoảng làm đồ hoạ');
    expect(initial.status).toBe('needs_clarification');
    expect(initial.status === 'needs_clarification' && initial.request.questions.length).toBeGreaterThan(0);

    const completion = await service.submitAnswers(sessionId, {
      laptop_budget: 'Khoảng 20 triệu',
      laptop_use_case: 'Học đại học và chỉnh sửa ảnh nhẹ',
      laptop_brands: 'Ưu tiên ASUS',
      laptop_priority: 'Ưu tiên gọn nhẹ và pin ổn',
      laptop_power: 'Có GPU rời càng tốt để làm AI cơ bản',
    });

    expect(completion.status).toBe('complete');
    if (completion.status === 'complete') {
      expect(completion.profile.pref_brands).toContain('asus');
      expect(completion.profile.budget_vnd).toBe(20_000_000);
      expect(completion.profile.product_type).toBe('laptop');
      if (completion.profile.product_type !== 'laptop') {
        throw new Error('Expected laptop profile');
      }
      expect(completion.profile.category_profile.needs_ai).toBe(true);
    }
  });
});
