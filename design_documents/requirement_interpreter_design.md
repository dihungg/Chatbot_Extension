# Requirement Interpreter Integration Design

This document explains how we will integrate the Vietnamese **Requirement Interpreter** into the Nanobrowser architecture (see `chrome-extension/package_tree.md`). The design keeps the existing agent pipeline intact, respects SOLID principles, and leaves room for future categories (tablet, speaker, mouse, etc.).

## 1. Module placement

Inside `chrome-extension/src/background/agent` we introduce a new folder:

```
agent/
├── requirement-interpreter/
│   ├── service.ts          // RequirementInterpreterService (orchestration entry)
│   ├── promptBuilder.ts    // builds LLM prompt from template + schema
│   ├── questionLibrary.ts  // category-specific question metadata
│   ├── profileParser.ts    // normalizes answers into TargetProductProfileV1
│   └── types.ts            // internal interfaces (ClarificationQuestion, etc.)
```

**Responsibilities**

- `RequirementInterpreterService`
  - API: `ensureProfile(sessionId: string, rawTask: string, overrides?: Partial<TargetProductProfileV1>): Promise<TargetProductProfileV1>`
  - Injected dependencies: `PromptBuilder`, `QuestionLibrary`, `ProfileParser`, `TargetProductProfileRepository`, `LLMClient`.
  - Orchestration only: detect missing fields, request clarifications via side panel, store completed profile.

- `PromptBuilder`
  - Consumes `design_documents/base_prompt_template.md` content (baked into code as template strings).
  - Accepts question set + partial profile and produces the final system/user prompt pair for the clarification LLM call.

- `QuestionLibrary`
  - Data map keyed by `product_type`.
  - Each entry describes: question text, which schema fields it fills, how to interpret answers (budget range, priority scores, boolean flags).
  - Adding a new category only touches this file + schema types.

- `ProfileParser`
  - Converts LLM outputs and/or user replies into the discriminated union (`TargetProductProfileV1`).
  - Handles numeric extraction, range splitting, brand array parsing, priority scale mapping.

## 2. Shared types & storage

- Move Variant 1 definitions (`TargetProductProfileV1`, `BudgetVnd`, `LaptopCategoryProfile`, etc.) to `packages/shared/src/targetProductProfile.ts`.
- Export a `TargetProductProfileRepository` interface under `packages/storage`:

```ts
export interface TargetProductProfileRepository {
  get(sessionId: string): Promise<TargetProductProfileV1 | null>;
  set(sessionId: string, profile: TargetProductProfileV1): Promise<void>;
  clear(sessionId: string): Promise<void>;
}
```

- Provide a chrome-storage backed implementation in `packages/storage/lib/targetProductProfile.ts`, injected into the service (Dependency Inversion).

## 3. Background integration (see `chrome-extension/src/background/index.ts`)

1. **new_task handling**
   - Before calling `setupExecutor`, invoke `requirementInterpreter.ensureProfile(chatSessionId, rawTask, message.profileOverrides)`.
   - If profile missing data, the service emits a `requirement_clarification` event, posting questions to the side panel (`currentPort.postMessage`).
   - Background pauses executor creation until the UI returns answers via `requirement_answers`.

2. **Executor context**
   - Extend `AgentContext` (in `agent/types.ts`) with `targetProductProfile?: TargetProductProfileV1`.
   - Update `Executor` constructor to accept the profile and assign it to `context.targetProductProfile` after initializing `messageManager`.

3. **Planner prompt**
   - Modify `PlannerPrompt` (in `agent/prompts/planner.ts`) to accept an optional `TargetProductProfileV1`.
   - Inject a `TargetProductDescriptionBuilder` that converts the profile into the canonical Vietnamese template (`Loại sản phẩm`, `Mục tiêu`, `Ngân sách`, `Yêu cầu tối thiểu`, `Ưu tiên mềm`, `Trang web cần duyệt`).
   - The builder reads `category_profile` flags to populate minimum requirements and soft priorities. This message is appended to the planner system prompt on every run.

4. **Navigator (future-friendly)**
   - No immediate change, but `AgentContext.targetProductProfile` allows navigator actions to access category flags later (e.g., to bias DOM heuristics).

## 4. Side panel protocol additions

Add two new message types in the background ↔ side panel interface:

| Direction | Type                       | Payload                                                     |
|-----------|---------------------------|-------------------------------------------------------------|
| BG → UI   | `requirement_clarification` | `{ sessionId, questions: ClarificationQuestion[] }`         |
| UI → BG   | `requirement_answers`       | `{ sessionId, answers: Record<string, string> }`            |

- `ClarificationQuestion` carries an `id`, `text`, `fieldHints` (e.g., `budget_vnd`, `pref_brands`), and optional `category`.
- The background queues the pending executor start until answers are received and parsed.
- History / replay flows reuse stored profiles, so they skip this round-trip unless the user explicitly edits requirements.

## 5. Data flow summary

1. Side panel sends `new_task`.
2. Background calls `RequirementInterpreterService.ensureProfile`.
3. If clarifications needed:
   - Background emits `requirement_clarification`.
   - UI renders the questions, collects responses, and replies with `requirement_answers`.
   - Service parses responses, saves profile via repository, returns it to the caller.
4. `setupExecutor` runs with the finalized profile.
5. `Executor` sets `context.targetProductProfile`.
6. Planner prompt builder injects canonical product description; Navigator/other agents can reference the same profile.
7. Profile persists in storage for the session; follow-up tasks in the same session reuse it unless user overrides fields.

## 6. SOLID alignment

- **S**RP: each new class (service, builder, parser, repository) has a single reason to change.
- **O**CP: adding categories only needs schema + question library extensions; core orchestration stays untouched.
- **L**SP: repositories can be swapped (memory vs chrome storage) without affecting consumers.
- **I**SP: side panel implements only two focused message types rather than depending on interpreter internals.
- **D**IP: RequirementInterpreterService depends on abstractions (LLM client, repository, builder) injected at construction, not on concrete modules.

This layout keeps the current API surface, aligns with the package structure in `chrome-extension/package_tree.md`, and makes future expansion straightforward.
