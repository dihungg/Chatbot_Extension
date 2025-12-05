# TODO – Requirement Interpreter Integration

- [x] Shared foundation *(follow AGENTS.md rules: use pnpm, workspace-scoped commands)*
  - [x] Add `targetProductProfile.ts` types to `packages/shared` → verify with `pnpm -F packages/shared type-check`. *(blocked: Node binary unavailable in sandbox)*
  - [x] Define `TargetProductProfileRepository` interface + chrome storage impl in `packages/storage` → run `pnpm -F packages/storage type-check`. *(blocked: Node binary unavailable in sandbox)*
- [x] Interpreter module scaffold *(keep diffs focused; no new global configs)*
  - [x] Create `agent/requirement-interpreter/` directory (service, promptBuilder, questionLibrary, profileParser, types).
  - [x] Encode base prompt template + question metadata into PromptBuilder + QuestionLibrary (Vietnamese text from design docs).
- [x] Background wiring *(within chrome-extension workspace)*
  - [x] Instantiate `RequirementInterpreterService` in `chrome-extension/src/background/index.ts`.
  - [x] Add `requirement_clarification` / `requirement_answers` handlers and queue executor start until profile ready.
  - [x] Extend `AgentContext` + `Executor` to carry `targetProductProfile`.
- [x] Planner integration
  - [x] Implement `TargetProductDescriptionBuilder` and inject into `PlannerPrompt` workflow so Planner sees canonical profile context.
- [ ] Testing & validation *(prefer pnpm workspace commands per AGENTS.md)*
  - [x] Add parser/storage unit tests (`pnpm -F chrome-extension test -- <pattern>` as needed).
  - [ ] Manually verify laptop/phone/headphone flows end-to-end in dev build. *(blocked: cannot run Chrome extension in current environment)*
