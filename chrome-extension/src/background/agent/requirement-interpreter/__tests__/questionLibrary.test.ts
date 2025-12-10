import { describe, expect, it } from 'vitest';
import type { TargetProductProfile } from '@extension/shared';
import { QuestionLibrary } from '../questionLibrary';

const buildPhoneProfile = (overrides?: Partial<TargetProductProfile>): TargetProductProfile => ({
  product_type: 'phone',
  budget_vnd: 15_000_000,
  pref_brands: [],
  avoid_brands: [],
  requirements_context: [],
  clarification_opt_outs: {},
  notes: undefined,
  ...overrides,
});

describe('QuestionLibrary predicates', () => {
  const library = new QuestionLibrary();

  it('considers phone priority resolved when it is marked as opted out/resolved', () => {
    // In the new system, answering a question sets its opt-out flag to true (meaning resolved)
    const profile = buildPhoneProfile({
      clarification_opt_outs: { phone_priority: true },
    });

    const questions = library.getPendingQuestions(profile);
    expect(questions.find(question => question.id === 'phone_priority')).toBeUndefined();
  });

  it('skips brand questions when the user opted out', () => {
    const profile = buildPhoneProfile({
      clarification_opt_outs: { phone_brands: true },
    });

    const questions = library.getPendingQuestions(profile);
    expect(questions.find(question => question.id === 'phone_brands')).toBeUndefined();
  });

  it('skips use_case question if context contains relevant keywords (gaming)', () => {
    const profile = buildPhoneProfile({
      requirements_context: ['I need a phone for gaming'],
    });
    const questions = library.getPendingQuestions(profile);
    expect(questions.find(q => q.id === 'phone_use_case')).toBeUndefined();
  });

  it('skips priority question if context contains relevant keywords (battery)', () => {
    const profile = buildPhoneProfile({
      requirements_context: ['I need a phone with huge battery'],
    });
    const questions = library.getPendingQuestions(profile);
    expect(questions.find(q => q.id === 'phone_priority')).toBeUndefined();
  });

  it('asks priority question if context does NOT contain relevant keywords', () => {
    const profile = buildPhoneProfile({
      requirements_context: ['I need a phone'],
    });
    // Assuming phone_priority is a default question that hasn't been opted out
    const questions = library.getPendingQuestions(profile);
    expect(questions.find(q => q.id === 'phone_priority')).toBeDefined();
  });

  it('skips feature question if context contains relevant keywords (5g)', () => {
    const profile = buildPhoneProfile({
      requirements_context: ['Mua điện thoại có 5G nha'],
    });
    const questions = library.getPendingQuestions(profile);
    expect(questions.find(q => q.id === 'phone_features')).toBeUndefined();
  });
});

describe('markAllQuestionsResolved', () => {
  const library = new QuestionLibrary();

  it('marks all phone questions as opted-out for a phone profile', () => {
    const profile = buildPhoneProfile();
    const resolved = library.markAllQuestionsResolved(profile, 'phone');

    const questions = library.getPendingQuestions(resolved);
    expect(questions.length).toBe(0);
  });

  it('marks all phone questions as opted-out individually', () => {
    const profile = buildPhoneProfile();
    const resolved = library.markAllQuestionsResolved(profile, 'phone');

    expect(resolved.clarification_opt_outs['phone_budget']).toBe(true);
    expect(resolved.clarification_opt_outs['phone_use_case']).toBe(true);
    expect(resolved.clarification_opt_outs['phone_brands']).toBe(true);
    expect(resolved.clarification_opt_outs['phone_priority']).toBe(true);
    expect(resolved.clarification_opt_outs['phone_features']).toBe(true);
  });

  it('marks all laptop questions as opted-out for a laptop profile', () => {
    const laptopProfile: TargetProductProfile = {
      product_type: 'laptop',
      budget_vnd: null,
      pref_brands: [],
      avoid_brands: [],
      requirements_context: [],
      clarification_opt_outs: {},
    };

    const resolved = library.markAllQuestionsResolved(laptopProfile, 'laptop');

    expect(resolved.clarification_opt_outs['laptop_budget']).toBe(true);
    expect(resolved.clarification_opt_outs['laptop_use_case']).toBe(true);
    expect(resolved.clarification_opt_outs['laptop_brands']).toBe(true);
    expect(resolved.clarification_opt_outs['laptop_priority']).toBe(true);
    expect(resolved.clarification_opt_outs['laptop_power']).toBe(true);
  });

  it('marks all headphones questions as opted-out for a headphones profile', () => {
    const headphonesProfile: TargetProductProfile = {
      product_type: 'headphones',
      budget_vnd: null,
      pref_brands: [],
      avoid_brands: [],
      requirements_context: [],
      clarification_opt_outs: {},
    };

    const resolved = library.markAllQuestionsResolved(headphonesProfile, 'headphones');

    expect(resolved.clarification_opt_outs['headphones_budget']).toBe(true);
    expect(resolved.clarification_opt_outs['headphones_use_case']).toBe(true);
    expect(resolved.clarification_opt_outs['headphones_brands']).toBe(true);
    expect(resolved.clarification_opt_outs['headphones_isolation']).toBe(true);
    expect(resolved.clarification_opt_outs['headphones_style']).toBe(true);
  });

  it('preserves existing opt-outs when marking all questions resolved', () => {
    const profile = buildPhoneProfile({
      clarification_opt_outs: { some_other_flag: true },
    });

    const resolved = library.markAllQuestionsResolved(profile, 'phone');

    expect(resolved.clarification_opt_outs['some_other_flag']).toBe(true);
    expect(resolved.clarification_opt_outs['phone_budget']).toBe(true);
  });

  it('does not mutate the original profile', () => {
    const profile = buildPhoneProfile();
    const originalOptOuts = { ...profile.clarification_opt_outs };

    library.markAllQuestionsResolved(profile, 'phone');

    expect(profile.clarification_opt_outs).toEqual(originalOptOuts);
  });

  it('returns a new profile object', () => {
    const profile = buildPhoneProfile();
    const resolved = library.markAllQuestionsResolved(profile, 'phone');

    expect(resolved).not.toBe(profile);
  });
});
