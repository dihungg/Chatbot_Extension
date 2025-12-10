# Root Cause Analysis for Planner Observation Issue

**Date:** 2025-12-09

## 1. Problem Description

The `PlannerAgent`'s initial `observation` is consistently generic and does not reflect detailed user requirements (e.g., budget, brand preferences, feature priorities) even when this information is provided by the user and a "profile" is noted as present in the logs (`hasProfile: true`). This forces the agent to ask clarifying questions that the user has already answered, leading to a redundant and inefficient user experience.

## 2. Investigation Summary

The investigation traced the flow of user input from the initial "new_task" command through the background scripts and into the multi-agent system.

- **Data Reception:** The user's detailed requirements are captured and processed by the `RequirementInterpreterService`, which successfully creates a `TargetProductProfile` object.
- **Context Propagation:** This `TargetProductProfile` is correctly passed from `background/index.ts` to the `Executor` and stored within the `AgentContext`. The `AgentContext` is then shared with the `PlannerAgent`.
- **Point of Failure:** The breakdown occurs within the `PlannerAgent` and its associated `PlannerPrompt`. The agent is designed to construct its prompt to the LLM using only the system message, the conversation history, and an "observation" built from past *actions*. It never reads or includes the `targetProductProfile` data from its own context.

## 3. Root Cause

The fundamental root cause is a **design gap in the `PlannerAgent`'s prompt engineering**.

The `PlannerAgent`'s `execute` method (`chrome-extension/src/background/agent/agents/planner.ts`) constructs the messages for the LLM by combining a static system prompt with the message history.

```typescript
// chrome-extension/src/background/agent/agents/planner.ts
async execute(): Promise<AgentOutput<PlannerOutput>> {
    // ...
    const messages = this.context.messageManager.getMessages();
    const plannerMessages = [this.prompt.getSystemMessage(), ...messages.slice(1)];
    // ...
    const modelOutput = await this.invoke(plannerMessages);
    // ...
}
```

The `targetProductProfile`, which contains the crucial user preferences, is available in `this.context.targetProductProfile` but is **never accessed or injected into the `plannerMessages`**.

Furthermore, the `PlannerPrompt` class (`chrome-extension/src/background/agent/prompts/planner.ts`) is also unaware of the profile. Its `getUserMessage` method builds an observation string based exclusively on the agent's past actions and results (`context.history`), completely ignoring the `targetProductProfile`.

As a result, the planner LLM only sees the generic initial task and the results of web navigation; it has zero context regarding the user's specific constraints like budget, preferred brands, or other detailed requirements. Its observations and plans are therefore necessarily generic.

## 4. Proposed Solution (for implementation)

To fix this, the `PlannerAgent` must be modified to inject the `targetProductProfile` into the information sent to the LLM.

A potential solution would be to modify the `PlannerAgent`'s `execute` method to prepend the profile information to the message history if it exists.

**Example Modification in `planner.ts`:**

```typescript
// ... inside PlannerAgent.execute()

const messages = this.context.messageManager.getMessages();
const plannerMessages = [this.prompt.getSystemMessage(), ...messages.slice(1)];

// *** PROPOSED CHANGE START ***
if (this.context.targetProductProfile) {
    const profileMessage = new HumanMessage(
        `CRITICAL USER PROFILE AND REQUIREMENTS:
        Here is the user's profile with their specific requirements. You MUST adhere to these constraints in all subsequent planning and observations.
        ---
        ${JSON.stringify(this.context.targetProductProfile, null, 2)}
        ---`
    );
    // Insert the profile message right after the system prompt.
    plannerMessages.splice(1, 0, profileMessage);
}
// *** PROPOSED CHANGE END ***

// ... continue with existing logic
```
