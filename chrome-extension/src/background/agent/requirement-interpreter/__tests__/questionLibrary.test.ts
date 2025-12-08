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
});
