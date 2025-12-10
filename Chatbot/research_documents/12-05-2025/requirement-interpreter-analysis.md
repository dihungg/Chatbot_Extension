# Requirement Interpreter Analysis & Solutions
**Date:** December 5, 2025  
**Author:** AI Code Analysis  
**Status:** Complete  

---

## Table of Contents
1. [Overview](#overview)
2. [Issue 1: Dangerous Default Fallback](#issue-1-dangerous-default-fallback)
3. [Issue 2: Duplicate Questions](#issue-2-duplicate-questions)
4. [Issue 3: Response Flow & Architecture](#issue-3-response-flow--architecture)
5. [Implementation Plan](#implementation-plan)

---

## Overview

The Requirement Interpreter is a critical component in the Chatbot Extension that:
- Analyzes user tasks to determine product type (laptop, phone, headphones)
- Collects missing information through clarification questions
- Builds a complete `TargetProductProfile` for downstream agents

**Key Files:**
- `chrome-extension/src/background/agent/requirement-interpreter/service.ts` - Main service
- `chrome-extension/src/background/agent/requirement-interpreter/profileParser.ts` - Profile management
- `chrome-extension/src/background/agent/requirement-interpreter/questionLibrary.ts` - Questions & inference
- `pages/side-panel/src/SidePanel.tsx` - UI layer
- `chrome-extension/src/background/index.ts` - Background service worker (message handling)

---

## Issue 1: Dangerous Default Fallback

### Problem Description
**Location:** `chrome-extension/src/background/agent/requirement-interpreter/service.ts`, lines 39-41

```typescript
const category =
  overrides?.product_type ?? existing?.product_type ?? this.questionLibrary.inferCategory(rawTask, 'laptop');
```

**Risk:** If `inferCategory()` cannot determine the product type, the system defaults to `'laptop'`. This is dangerous because:
- User asks "I need a refrigerator" → System infers 'laptop'
- System asks irrelevant questions (GPU needs, portability, battery life)
- Poor user experience and wasted interaction cycles
- The system only supports 3 categories: `['laptop', 'phone', 'headphones']`

### Root Cause
The `inferCategory()` method in `questionLibrary.ts` currently:
1. Searches for category-specific keywords in rawTask
2. Falls back to provided default ('laptop') if no match found
3. No validation that the inferred category is actually supported

### Solution

#### Step 1: Define Supported Categories
**File:** `chrome-extension/src/background/agent/requirement-interpreter/questionLibrary.ts`

Add at the top level:
```typescript
export const SUPPORTED_CATEGORIES = ['laptop', 'phone', 'headphones'] as const;

const UNSUPPORTED_KEYWORDS = [
  'tủ lạnh', 'máy giặt', 'tivi', 'điều hoà', 'máy lạnh',
  'lò vi sóng', 'bình nước', 'quạt', 'bàn là'
] as const;
```

#### Step 2: Improve `inferCategory()` Method
**File:** `chrome-extension/src/background/agent/requirement-interpreter/questionLibrary.ts`

Modify the method signature and implementation:
```typescript
/**
 * Attempt to infer product category from task description.
 * Returns null if category cannot be determined or is unsupported.
 */
inferCategory(rawTask: string): ProductType | null {
  const lower = rawTask.toLowerCase();
  
  // Check for unsupported categories first
  if (UNSUPPORTED_KEYWORDS.some(kw => lower.includes(kw))) {
    return null; // Explicitly indicate unsupported
  }
  
  // Attempt to infer from keywords
  if (lower.includes('laptop') || lower.includes('máy tính') || lower.includes('notebook')) {
    return 'laptop';
  }
  if (lower.includes('phone') || lower.includes('điện thoại') || lower.includes('smartphone')) {
    return 'phone';
  }
  if (lower.includes('headphones') || lower.includes('tai nghe') || lower.includes('earbuds')) {
    return 'headphones';
  }
  
  // Cannot determine category
  return null;
}
```

#### Step 3: Handle Null Category in `ensureProfile()`
**File:** `chrome-extension/src/background/agent/requirement-interpreter/service.ts`

Modify the `ensureProfile()` method (lines 35-67):
```typescript
async ensureProfile(
  sessionId: string,
  rawTask: string,
  overrides?: Partial<TargetProductProfile>,
): Promise<RequirementInterpreterResult> {
  const existing = await this.repository.get(sessionId);
  const category =
    overrides?.product_type ??
    existing?.product_type ??
    this.questionLibrary.inferCategory(rawTask);

  // ✅ NEW: Validate category
  if (!category) {
    return {
      status: 'error' as const,
      error: `Unable to determine product type. Supported categories: ${['laptop', 'phone', 'headphones'].join(', ')}`,
    };
  }

  this.sessionCache.set(sessionId, { sessionId, rawTask, category });

  const baseProfile =
    existing && existing.product_type === category
      ? existing
      : this.profileParser.createBaseProfile(category);

  const merged = this.profileParser.mergeOverrides(baseProfile, overrides);

  const pendingQuestions = this.questionLibrary.getPendingQuestions(merged);
  if (pendingQuestions.length > 0) {
    await this.repository.set(sessionId, merged);
    const prompt = this.promptBuilder.buildClarificationPrompt({
      category,
      rawTask,
      questions: pendingQuestions,
      partialProfile: merged,
    });

    return {
      status: 'needs_clarification',
      request: {
        sessionId,
        category,
        questions: pendingQuestions,
        prompt,
      },
    };
  }

  await this.repository.set(sessionId, merged);
  return {
    status: 'complete',
    profile: merged,
  };
}
```

#### Step 4: Update `RequirementInterpreterResult` Type
**File:** `chrome-extension/src/background/agent/requirement-interpreter/types.ts`

Add error variant to the union type:
```typescript
export type RequirementInterpreterResult =
  | { status: 'complete'; profile: TargetProductProfile }
  | { status: 'needs_clarification'; request: RequirementClarificationRequest }
  | { status: 'error'; error: string };
```

---

## Issue 2: Duplicate Questions

### Problem Description
**Location:** `chrome-extension/src/background/agent/requirement-interpreter/service.ts`, lines 46-60 and `submitAnswers()` method

**Issue:** If user mentions information in their initial task (e.g., "I need an iPhone under 15 million"), the system should NOT ask clarifying questions about brands or budget later. Currently:

1. User says: "I want iPhone under 15 million"
2. System doesn't auto-extract this information
3. System asks: "What brands do you prefer?"
4. System asks: "What's your budget?"
5. Poor user experience

### Root Cause
The `ensureProfile()` method only processes:
- Information from `overrides` parameter
- Previously stored profile from repository
- It does NOT automatically analyze the raw task text for implicit information

The information extraction only happens when user explicitly submits answers via `submitAnswers()` method.

### Solution

#### Step 1: Add Auto-Extraction Method
**File:** `chrome-extension/src/background/agent/requirement-interpreter/profileParser.ts`

Add new method to the `ProfileParser` class:
```typescript
/**
 * Automatically extract product information from raw user task.
 * Example: "I need iPhone under 15 million with good camera"
 * Extracts: { pref_brands: ['iphone'], budget_vnd: 15_000_000, use_case: 'camera' }
 */
autoExtractFromTask(task: string, productType: ProductType): Partial<TargetProductProfile> {
  const lower = task.toLowerCase();
  const extracted: Partial<TargetProductProfile> = {};

  // 1. Extract brand preferences
  const brandPatterns = [
    { regex: /(?:iphone|apple)/gi, brands: ['iphone'] },
    { regex: /(?:samsung|galaxy)/gi, brands: ['samsung'] },
    { regex: /(?:xiaomi|redmi)/gi, brands: ['xiaomi'] },
    { regex: /(?:oppo|vivo)/gi, brands: ['oppo', 'vivo'] },
    { regex: /(?:dell|hp|lenovo|asus|macbook|acer|msi)/gi, brands: ['$matched'] },
  ];

  for (const { regex, brands } of brandPatterns) {
    if (regex.test(lower)) {
      extracted.pref_brands = brands;
      break;
    }
  }

  // 2. Extract budget constraints
  // Patterns: "dưới 15 triệu", "khoảng 20-30 triệu", "tối đa 50 triệu"
  const budgetMatch = lower.match(
    /(?:dưới|khoảng|từ|tối đa|lên đến|khoảng từ)\s+(\d+(?:\.\d+)?)\s*(?:triệu|tỷ|k|đ|vnd)?/i
  );
  
  if (budgetMatch) {
    let amount = parseFloat(budgetMatch[1]);
    
    // Determine multiplier based on context
    if (budgetMatch[0].includes('tỷ')) {
      amount *= 1_000_000_000;
    } else if (budgetMatch[0].includes('triệu')) {
      amount *= 1_000_000;
    } else if (budgetMatch[0].includes('k')) {
      amount *= 1_000;
    }
    
    extracted.budget_vnd = Math.round(amount);
  }

  // 3. Extract use case keywords
  const useCaseMap: Record<string, string> = {
    gaming: ['gaming', 'chơi game', 'game', 'esport', 'fps'],
    programming: ['lập trình', 'code', 'coding', 'dev'],
    streaming: ['streaming', 'stream', 'youtube', 'twitch'],
    photography: ['ảnh', 'photo', 'camera', 'photography'],
    video_editing: ['quay video', 'edit video', 'video'],
    work: ['làm việc', 'office', 'văn phòng'],
  };

  for (const [useCase, keywords] of Object.entries(useCaseMap)) {
    if (keywords.some(kw => lower.includes(kw))) {
      extracted.use_case = useCase;
      break;
    }
  }

  // 4. Extract category-specific needs for laptop
  if (productType === 'laptop') {
    const categoryProfile = extracted.category_profile as Partial<LaptopCategoryProfile> || {};
    
    if (/gpu|đồ hoạ|đồ họa|graphic|nvidia|amd/i.test(lower)) {
      categoryProfile.needs_graphics = true;
    }
    if (/gaming|game|esport/i.test(lower)) {
      categoryProfile.needs_gaming = true;
    }
    if (/ai|machine learning|deep learning/i.test(lower)) {
      categoryProfile.needs_ai = true;
    }
    if (/gọn|nhẹ|portable/i.test(lower)) {
      categoryProfile.portability_priority = 5;
    }
    if (/pin|battery|on-screen/i.test(lower)) {
      categoryProfile.battery_priority = 5;
    }
    
    if (Object.keys(categoryProfile).length > 0) {
      extracted.category_profile = categoryProfile;
    }
  }

  // 5. Extract category-specific needs for phone
  if (productType === 'phone') {
    const categoryProfile = extracted.category_profile as Partial<PhoneCategoryProfile> || {};
    
    if (/camera|ảnh|quay vlog|photography/i.test(lower)) {
      categoryProfile.camera_priority = 5;
    }
    if (/5g/i.test(lower)) {
      categoryProfile.needs_5g = true;
    }
    if (/chống nước|waterproof|ip67|ip68/i.test(lower)) {
      extracted.notes = 'User mentioned water resistance requirement';
    }
    
    if (Object.keys(categoryProfile).length > 0) {
      extracted.category_profile = categoryProfile;
    }
  }

  // 6. Extract category-specific needs for headphones
  if (productType === 'headphones') {
    const categoryProfile = extracted.category_profile as Partial<HeadphonesCategoryProfile> || {};
    
    if (/anc|chống ồn|chong on|noise cancelling/i.test(lower)) {
      categoryProfile.anc = true;
      categoryProfile.sound_isolation = 5;
    }
    if (/không dây|wireless|bluetooth/i.test(lower)) {
      categoryProfile.wireless = true;
    }
    if (/gaming|game|độ trễ thấp/i.test(lower)) {
      categoryProfile.latency_sensitive = true;
    }
    
    if (Object.keys(categoryProfile).length > 0) {
      extracted.category_profile = categoryProfile;
    }
  }

  return extracted;
}
```

#### Step 2: Update `ensureProfile()` to Use Auto-Extraction
**File:** `chrome-extension/src/background/agent/requirement-interpreter/service.ts`

Modify lines 35-67 to call auto-extraction:
```typescript
async ensureProfile(
  sessionId: string,
  rawTask: string,
  overrides?: Partial<TargetProductProfile>,
): Promise<RequirementInterpreterResult> {
  const existing = await this.repository.get(sessionId);
  const category =
    overrides?.product_type ??
    existing?.product_type ??
    this.questionLibrary.inferCategory(rawTask);

  if (!category) {
    return {
      status: 'error' as const,
      error: `Unable to determine product type. Supported categories: laptop, phone, headphones`,
    };
  }

  this.sessionCache.set(sessionId, { sessionId, rawTask, category });

  const baseProfile =
    existing && existing.product_type === category
      ? existing
      : this.profileParser.createBaseProfile(category);

  // ✅ NEW: Auto-extract information from raw task
  const autoExtracted = this.profileParser.autoExtractFromTask(rawTask, category);

  // ✅ Merge priority: overrides > autoExtracted > baseProfile
  const merged = this.profileParser.mergeOverrides(
    baseProfile,
    { ...autoExtracted, ...overrides } // overrides have highest priority
  );

  const pendingQuestions = this.questionLibrary.getPendingQuestions(merged);
  if (pendingQuestions.length > 0) {
    await this.repository.set(sessionId, merged);
    const prompt = this.promptBuilder.buildClarificationPrompt({
      category,
      rawTask,
      questions: pendingQuestions,
      partialProfile: merged,
    });

    return {
      status: 'needs_clarification',
      request: {
        sessionId,
        category,
        questions: pendingQuestions,
        prompt,
      },
    };
  }

  await this.repository.set(sessionId, merged);
  return {
    status: 'complete',
    profile: merged,
  };
}
```

#### Step 3: Improve Question Filtering Logic
**File:** `chrome-extension/src/background/agent/requirement-interpreter/questionLibrary.ts`

Ensure `shouldAsk()` conditions check for extracted data:
```typescript
// Example for laptop_brands question
{
  id: 'laptop_brands',
  category: 'laptop',
  text: 'Có thương hiệu nào bạn muốn ưu tiên hoặc tránh không?',
  fieldHints: ['pref_brands', 'avoid_brands'],
  isCore: false, // Non-critical question
  shouldAsk: (profile) => 
    !profile.pref_brands?.length && !profile.avoid_brands?.length,
    // Only ask if user hasn't mentioned brands yet
}
```

---

## Issue 3: Response Flow & Architecture

### Overview
The response flow involves three main layers communicating through Chrome's port messaging system.

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     SIDE-PANEL (React UI)                       │
│                  pages/side-panel/src/SidePanel.tsx             │
├─────────────────────────────────────────────────────────────────┤
│ • User enters clarification answer                              │
│ • submitClarificationReq() collects form data                   │
│ • portRef.current.postMessage()                                 │
│   type: 'requirement_answers'                                   │
│   { sessionId, answers: QuestionAnswerMap }                     │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           │ Chrome Port Messaging
                           │ (Persistent Connection)
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│             BACKGROUND SERVICE WORKER                           │
│          chrome-extension/src/background/index.ts              │
├─────────────────────────────────────────────────────────────────┤
│ port.onMessage listener (line 271-293)                          │
│   case 'requirement_answers':                                   │
│     • Validate sessionId and answers object                     │
│     • Call requirementInterpreter.submitAnswers(                │
│         sessionId, answers                                      │
│       )                                                          │
│                                                                  │
│   • Check result.status:                                        │
│     ├─ 'needs_clarification': sendClarification()              │
│     ├─ 'complete': startNewTask() / startReplayTask()           │
│     └─ 'error': sendError()                                     │
│                                                                  │
│ Helper: sendClarification() (line 362-373)                      │
│   currentPort.postMessage({                                     │
│     type: 'requirement_clarification',                          │
│     payload: RequirementClarificationRequest                    │
│   })                                                             │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           │ Port Message Response
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│         REQUIREMENT INTERPRETER SERVICE                         │
│  chrome-extension/src/background/agent/requirement-interpreter/ │
│                      service.ts                                 │
├─────────────────────────────────────────────────────────────────┤
│ submitAnswers(sessionId, answers): Promise<...>                 │
│   1. Retrieve stored profile from repository                    │
│   2. Call profileParser.applyAnswers(profile, answers)          │
│   3. Call questionLibrary.getPendingQuestions(updatedProfile)   │
│   4. Return result with status and either:                      │
│      - Profile if complete                                      │
│      - Pending questions + prompt if clarification needed       │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           │ Result Analysis
                           │
                    ┌──────▼──────┐
                    │   Complete? │
                    └──────┬──────┘
                           │
              ┌────────────┴────────────┐
              │                         │
       ┌──────▼──────┐         ┌────────▼──────┐
       │    YES      │         │      NO       │
       └──────┬──────┘         └────────┬──────┘
              │                         │
       Load pending session     sendClarification()
       (new_task or replay)    → port.postMessage()
              │                  type: 'requirement_clarification'
              │                         │
       startNewTask()            ┌──────▼──────┐
       or                        │  Side-panel │
       startReplayTask()         │   receives  │
              │                  │   message   │
              │                  └──────┬──────┘
              │                         │
              ▼                         ▼
       ┌────────────────┐    ┌─────────────────┐
       │ Executor runs  │    │ ClarificationUI │
       │ Agent system   │    │ (re)renders     │
       └────────┬───────┘    │ next questions  │
                │            └────────┬────────┘
                │                     │
                ▼                     ▼
          Task results      User submits answer
         (shown in chat)    (back to top cycle)
```

### Detailed Step-by-Step Flow

#### Step 1: User Submits Answer (Side-panel)
**File:** `pages/side-panel/src/SidePanel.tsx`, line ~1100

```typescript
const submitClarificationReq = (payload: RequirementClarificationPayload) => {
  if (!portRef.current) return;

  // Collect answers from form
  const answers: Record<string, string> = {};
  payload.questions.forEach(q => {
    const userAnswer = clarificationCacheRef.current[q.id] || '';
    if (userAnswer.trim()) {
      answers[q.id] = userAnswer;
    }
  });

  // Validate that all questions are answered
  const unanswered = payload.questions.filter(q => !answers[q.id]?.trim());
  if (unanswered.length > 0) {
    setInputEnabled(true);
    return; // Don't send empty answers
  }

  // ✅ Send via persistent port connection
  portRef.current.postMessage({
    type: 'requirement_answers',
    sessionId: payload.sessionId,
    answers, // { [questionId]: userAnswer }
  });

  setClarificationSubmitting(true);
  setInputEnabled(false);
};
```

#### Step 2: Background Receives & Processes
**File:** `chrome-extension/src/background/index.ts`, line 271-293

```typescript
case 'requirement_answers': {
  // 1. Validate inputs
  if (!message.sessionId || typeof message.sessionId !== 'string') {
    return port.postMessage({
      type: 'error',
      error: t('bg_errors_noTaskId'),
    });
  }

  if (!message.answers || typeof message.answers !== 'object') {
    return port.postMessage({
      type: 'error',
      error: 'Invalid answers format',
    });
  }

  logger.info('Processing requirement answers', {
    sessionId: message.sessionId,
    questionCount: Object.keys(message.answers).length,
  });

  try {
    // 2. Call requirement interpreter to process answers
    const result = await requirementInterpreter.submitAnswers(
      message.sessionId,
      message.answers as QuestionAnswerMap,
    );

    // 3. Analyze result status
    if (result.status === 'needs_clarification') {
      // Still more questions needed
      logger.info('More clarification needed', {
        sessionId: message.sessionId,
        pendingQuestionsCount: result.request.questions.length,
      });
      sendClarification(result.request);
      break;
    }

    if (result.status === 'error') {
      // Error occurred during processing
      logger.error('Requirement interpretation error', result.error);
      port.postMessage({
        type: 'error',
        error: result.error,
      });
      break;
    }

    // Profile is now complete
    logger.info('Profile complete', {
      sessionId: message.sessionId,
      productType: result.profile.product_type,
    });

    // 4. Retrieve pending task session
    const pending = pendingRequirementSessions.get(message.sessionId);
    pendingRequirementSessions.delete(message.sessionId);

    if (!pending) {
      logger.error('No pending session found', {
        sessionId: message.sessionId,
      });
      port.postMessage({
        type: 'error',
        error: 'No task associated with this session',
      });
      break;
    }

    // 5. Start task with complete profile
    if (pending.type === 'new_task') {
      logger.info('Starting new task', {
        taskId: pending.taskId,
        tabId: pending.tabId,
      });
      await startNewTask(
        pending.taskId,
        pending.task,
        pending.tabId,
        result.profile
      );
    } else if (pending.type === 'replay') {
      logger.info('Starting replay task', {
        replayId: pending.replayId,
      });
      await startReplayTask(pending, result.profile);
    }
  } catch (error) {
    logger.error('Error processing requirement answers', error);
    port.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
  break;
}
```

#### Step 3: Background Sends Clarification Response
**File:** `chrome-extension/src/background/index.ts`, line 362-373

```typescript
function sendClarification(request: RequirementClarificationRequest) {
  if (!currentPort) {
    logger.warn('No port available to send clarification');
    return;
  }

  logger.info('Sending clarification to side-panel', {
    sessionId: request.sessionId,
    questionCount: request.questions.length,
  });

  // ✅ Send message back to side-panel
  currentPort.postMessage({
    type: 'requirement_clarification', // Message type identifier
    payload: {
      sessionId: request.sessionId,
      category: request.category,
      questions: request.questions,
      prompt: request.prompt,
    },
  });
}
```

#### Step 4: Side-panel Receives & Renders
**File:** `pages/side-panel/src/SidePanel.tsx`, line 406-434

```typescript
} else if (
  message &&
  message.type === 'requirement_clarification' &&
  message.payload
) {
  const payload = message.payload as RequirementClarificationPayload;

  logger.info('Received clarification request', {
    sessionId: payload.sessionId,
    questionCount: payload.questions.length,
  });

  // Check if we have cached answers from previous interaction
  const cachedAnswers: Record<string, string> = {};
  let hasAllAnswers = true;

  payload.questions.forEach(question => {
    const cached = clarificationCacheRef.current[question.id];
    if (cached && cached.trim()) {
      cachedAnswers[question.id] = cached;
    } else {
      hasAllAnswers = false;
    }
  });

  // Auto-submit if all questions were already answered
  if (hasAllAnswers && Object.keys(cachedAnswers).length === payload.questions.length) {
    logger.info('Auto-submitting cached clarification answers');
    await autoSubmitClarificationAnswers(payload, cachedAnswers);
    return;
  }

  // Otherwise, show UI for user to fill in missing answers
  setPendingClarification(payload);
  setClarificationSubmitting(false);
  setInputEnabled(true);
}
```

### Message Type Reference

| Message Type | Direction | Sender | Receiver | Payload |
|--------------|-----------|--------|----------|---------|
| `requirement_answers` | Side-panel → Background | SidePanel.tsx | background/index.ts | `{ sessionId: string, answers: QuestionAnswerMap }` |
| `requirement_clarification` | Background → Side-panel | background/index.ts | SidePanel.tsx | `RequirementClarificationPayload` |
| `error` | Either direction | Either | Either | `{ error: string }` |

### Data Type Definitions

**From `types.ts`:**
```typescript
export type RequirementInterpreterResult =
  | { status: 'complete'; profile: TargetProductProfile }
  | { status: 'needs_clarification'; request: RequirementClarificationRequest }
  | { status: 'error'; error: string };

export interface RequirementClarificationRequest {
  sessionId: string;
  category: ProductType;
  questions: QuestionDefinition[];
  prompt: string;
}

export type QuestionAnswerMap = Record<string, string>; // { [questionId]: answer }
```

---

## Implementation Plan

### Phase 1: Fix Default Fallback (Priority: HIGH)
**Effort:** 2-3 hours

1. ✅ Add `SUPPORTED_CATEGORIES` constant to `questionLibrary.ts`
2. ✅ Add `UNSUPPORTED_KEYWORDS` constant to `questionLibrary.ts`
3. ✅ Modify `inferCategory()` to return `ProductType | null`
4. ✅ Update `ensureProfile()` to handle null category
5. ✅ Add error variant to `RequirementInterpreterResult` type
6. ✅ Update background message handler to send error response
7. ✅ Update side-panel to display error message to user

**Test Cases:**
- User says "I need a refrigerator" → System returns error
- User says "I need a laptop" → System correctly infers 'laptop'
- User says "I need a phone" → System correctly infers 'phone'

### Phase 2: Auto-Extract Information (Priority: HIGH)
**Effort:** 4-5 hours

1. ✅ Implement `autoExtractFromTask()` in `ProfileParser`
2. ✅ Add regex patterns for brands, budget, use cases
3. ✅ Update `ensureProfile()` to call auto-extraction
4. ✅ Test extraction patterns with real user inputs
5. ✅ Improve `shouldAsk()` conditions in question definitions
6. ✅ Add test cases for extraction edge cases

**Test Cases:**
- User says "iPhone under 15 million" → Extract brand + budget
- User says "laptop for gaming with RTX" → Extract use case + GPU need
- User says "headphones with ANC" → Extract isolation preference

### Phase 3: Documentation & Testing (Priority: MEDIUM)
**Effort:** 2 hours

1. ✅ Add JSDoc comments to new methods
2. ✅ Update existing code comments
3. ✅ Create unit tests for extraction logic
4. ✅ Test full flow: task → clarification → completion
5. ✅ Test error handling paths

---

## Related Issues & References

### Open Questions
1. Should brand extraction be case-sensitive? (Currently: no)
2. What's the maximum budget we should accept? (Need validation)
3. Should we auto-submit if all answers are cached?

### Performance Considerations
- `autoExtractFromTask()` uses regex matching → O(n) where n = task length
- Regex compilation happens at runtime → Consider pre-compiling
- Multiple regex tests could be optimized with single pass

### Security Considerations
- Avoid storing user answers in browser cache indefinitely
- Clear sensitive data when session ends
- Validate all incoming message data from port

---

## Code References

### Files to Modify
1. **`chrome-extension/src/background/agent/requirement-interpreter/questionLibrary.ts`**
   - Add constants
   - Modify `inferCategory()` method

2. **`chrome-extension/src/background/agent/requirement-interpreter/profileParser.ts`**
   - Add `autoExtractFromTask()` method

3. **`chrome-extension/src/background/agent/requirement-interpreter/service.ts`**
   - Modify `ensureProfile()` method

4. **`chrome-extension/src/background/agent/requirement-interpreter/types.ts`**
   - Add `error` variant to `RequirementInterpreterResult`

5. **`chrome-extension/src/background/index.ts`**
   - Update message handler for error responses

6. **`pages/side-panel/src/SidePanel.tsx`**
   - Update error message display

---

## Testing Checklist

- [ ] Unit test `autoExtractFromTask()` with various inputs
- [ ] Unit test `inferCategory()` with unsupported categories
- [ ] Integration test: task → clarification → completion flow
- [ ] E2E test: user submits task → sees clarification → submits answers → task starts
- [ ] Error handling: invalid category → error message displayed
- [ ] Error handling: invalid message format → graceful error
- [ ] Performance: extraction doesn't cause noticeable lag

---

**Last Updated:** December 5, 2025  
**Status:** Research Complete - Ready for Implementation
