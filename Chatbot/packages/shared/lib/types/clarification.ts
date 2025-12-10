export type ClarificationQuestionUiVariant = {
  type: 'brand_split';
  fieldMap: ['pref_brands', 'avoid_brands'];
};

export type ClarificationAnswerValue =
  | string
  | {
      pref: string;
      avoid: string;
    };
