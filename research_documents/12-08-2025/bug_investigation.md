# Bug Investigation - 12-08-2025

This document outlines the investigation into the three failed unit tests related to the `requirement-interpreter` agent.

## Summary of Failures

1.  **`profileParser.test.ts`**: `ProfileParser > applies preference extractor output when provided`
    -   **Error**: `AssertionError: expected undefined to be 4`
    -   **Cause**: A nested `category_profile` object was not being correctly created/updated due to a state mutation issue. Functions modifying the profile were directly mutating a nested object, which, when combined with object spreading, led to the loss of updated data.

2.  **`service.test.ts`**: `RequirementInterpreterService > completes clarification when user answers only one phone priority`
    -   **Error**: `AssertionError: expected 'needs_clarification' to be 'complete'`
    -   **Cause**: The root cause is a logic bug in `questionLibrary.ts`. The service continues to ask clarification questions because the `shouldAsk` logic doesn't correctly determine that a question has been sufficiently answered.

3.  **`service.test.ts`**: `RequirementInterpreterService > records opt-outs and stops looping on the same question`
    -   **Error**: `AssertionError: expected 'needs_clarification' to be 'complete'`
    -   **Cause**: Similar to the above, this is caused by a bug in `questionLibrary.ts`. The logic for determining the next question (`getPendingQuestions`) fails to check if the user has already opted out of a question (`clarification_opt_outs`). As a result, it keeps asking the same question instead of marking the clarification process as complete.

## Remediation Plan

1.  **Fix `profileParser.ts`**: Refactor all functions that modify the `category_profile` (`applyLaptopPriority`, `applyLaptopPower`, `applyPhonePriority`, etc.) to use an immutable pattern. This involves creating a copy of the nested `category_profile` object before modification, ensuring state is preserved correctly. (Completed)

2.  **Fix `questionLibrary.ts`**: Update the `shouldAsk` helper functions (`hasAnyCategoryValues`, `hasBrands`) and any direct implementations inside `QUESTION_DEFINITIONS` to first check the `profile.clarification_opt_outs` map. If a user has opted out of a question, `shouldAsk` must return `false`. This will be done by replacing the file with a corrected version.

3.  **Verification**: Run all unit tests for the `chrome-extension` workspace to confirm that all three failures are resolved.
