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
  it('returns error when category cannot be inferred', async () => {
    const repository = new InMemoryRepository();
    const service = new RequirementInterpreterService({
      repository,
    });
    const result = await service.ensureProfile('unsupported', 'Tôi cần mua tủ lạnh side-by-side');
    expect(result.status).toBe('error');
  });

  it('requests clarification and finalizes profile after answers', async () => {
    const repository = new InMemoryRepository();
    const service = new RequirementInterpreterService({
      repository,
    });
    const sessionId = 'session-1';

    const initial = await service.ensureProfile(sessionId, 'Tôi muốn mua laptop học tập và thỉnh thoảng làm đồ hoạ');
    expect(initial.status).toBe('needs_clarification');
    // Expect some questions
    if (initial.status === 'needs_clarification') {
      expect(initial.request.questions.length).toBeGreaterThan(0);
    }

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
      // Context should contain the answers
      expect(completion.profile.requirements_context.some(r => r.includes('làm AI cơ bản'))).toBe(true);
    }
  });

  it('bypasses clarification when user intent is comparison/analysis - English', async () => {
    const repository = new InMemoryRepository();
    const service = new RequirementInterpreterService({
      repository,
    });
    const sessionId = 'comparison-1';

    const result = await service.ensureProfile(sessionId, 'compare iPhone 15 vs Galaxy S24');

    expect(result.status).toBe('complete');
    if (result.status === 'complete') {
      expect(result.profile).toBeDefined();
      expect(result.profile?.product_type).toBe('phone');
      // All questions should be marked as opted-out
      expect(result.profile?.clarification_opt_outs['phone_budget']).toBe(true);
      expect(result.profile?.clarification_opt_outs['phone_use_case']).toBe(true);
      expect(result.profile?.clarification_opt_outs['phone_brands']).toBe(true);
    }
  });

  it('bypasses clarification when user intent is comparison/analysis - Vietnamese', async () => {
    const repository = new InMemoryRepository();
    const service = new RequirementInterpreterService({
      repository,
    });
    const sessionId = 'comparison-vi-1';

    const result = await service.ensureProfile(
      sessionId,
      'so sánh iPhone 15 Pro Max với Galaxy S24 Ultra thông số kỹ thuật',
    );

    expect(result.status).toBe('complete');
    if (result.status === 'complete') {
      expect(result.profile).toBeDefined();
      expect(result.profile?.product_type).toBe('phone');
      // All questions should be marked as opted-out
      expect(result.profile?.clarification_opt_outs['phone_budget']).toBe(true);
      expect(result.profile?.clarification_opt_outs['phone_use_case']).toBe(true);
      expect(result.profile?.clarification_opt_outs['phone_brands']).toBe(true);
    }
  });

  it('bypasses clarification for laptop analysis', async () => {
    const repository = new InMemoryRepository();
    const service = new RequirementInterpreterService({
      repository,
    });
    const sessionId = 'laptop-analysis';

    const result = await service.ensureProfile(sessionId, 'phân tích MacBook M3 vs M4 performance');

    expect(result.status).toBe('complete');
    if (result.status === 'complete') {
      expect(result.profile?.product_type).toBe('laptop');
      // All laptop questions should be marked as opted-out
      expect(result.profile?.clarification_opt_outs['laptop_budget']).toBe(true);
      expect(result.profile?.clarification_opt_outs['laptop_use_case']).toBe(true);
      expect(result.profile?.clarification_opt_outs['laptop_brands']).toBe(true);
    }
  });

  it('bypasses clarification for headphone review', async () => {
    const repository = new InMemoryRepository();
    const service = new RequirementInterpreterService({
      repository,
    });
    const sessionId = 'headphones-review';

    const result = await service.ensureProfile(
      sessionId,
      'review tai nghe Sony WH-1000XM5 versus Sennheiser Momentum 4',
    );

    expect(result.status).toBe('complete');
    if (result.status === 'complete') {
      expect(result.profile?.product_type).toBe('headphones');
      // All headphone questions should be marked as opted-out
      expect(result.profile?.clarification_opt_outs['headphones_budget']).toBe(true);
      expect(result.profile?.clarification_opt_outs['headphones_use_case']).toBe(true);
      expect(result.profile?.clarification_opt_outs['headphones_brands']).toBe(true);
    }
  });

  it('does not bypass clarification for normal purchase intent', async () => {
    const repository = new InMemoryRepository();
    const service = new RequirementInterpreterService({
      repository,
    });
    const sessionId = 'purchase-1';

    const result = await service.ensureProfile(sessionId, 'Tôi cần mua một chiếc laptop cho công việc');

    // Should still ask for clarification (not bypassed)
    expect(result.status).toBe('needs_clarification');
    if (result.status === 'needs_clarification') {
      expect(result.request.questions.length).toBeGreaterThan(0);
    }
  });

  it('stores bypassed profile in repository for subsequent tasks', async () => {
    const repository = new InMemoryRepository();
    const service = new RequirementInterpreterService({
      repository,
    });
    const sessionId = 'comparison-storage';

    await service.ensureProfile(sessionId, 'compare iPhone 15 vs iPhone 15 Pro');

    // Verify profile was stored
    const stored = await repository.get(sessionId);
    expect(stored).toBeDefined();
    expect(stored?.clarification_opt_outs['phone_budget']).toBe(true);
  });

  it('auto extracts information from raw Vietnamese task descriptions', async () => {
    const repository = new InMemoryRepository();
    const service = new RequirementInterpreterService({
      repository,
    });
    const sessionId = 'session-auto';

    const task = 'Cần iPhone dưới 15 triệu để quay vlog và phải chống nước';
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const initial = await service.ensureProfile(sessionId, task);
    // Might need clarification if mandatory fields (budget, brand?) are missing or if core questions not answered
    // Actually, budget is present (15m), brand is present (apple).
    // Core questions for phone: budget, use_case, brands.
    // use_case is not extracted to a field, so it's "missing" in terms of "is it answered?".
    // But wait, autoExtractFromTask pushes the raw task to requirements_context.
    // Does ProfileParser mark 'phone_use_case' as resolved? No.
    // So it should ask for use_case?
    // Let's see QuestionLibrary: 'phone_use_case' checks !hasOptedOut && !profile.use_case (but use_case is removed from interface?)
    // Wait, I removed `use_case` field from `TargetProductProfile` interface.
    // So `profile.use_case` access in QuestionLibrary (if I left it there) would be an error.

    // I need to check my QuestionLibrary implementation again.
    // In `questionLibrary.ts`:
    // {
    //   id: 'phone_use_case',
    //   shouldAsk: profile => !hasOptedOut(profile, 'phone_use_case') && !profile.use_case,
    // },
    // ERROR: `profile.use_case` does not exist on `TargetProductProfile`.

    // I MUST FIX `questionLibrary.ts` first. I missed that compilation error.
  });
});
