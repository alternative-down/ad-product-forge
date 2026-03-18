# Agent Budget Execution Approach

## Goal

Define a technical approach for pacing agent execution over a 7-day contract budget.

This document focuses on how to control execution timing with Mastra primitives and how to keep the agent running over time according to budget.

It does not define the business rules of the contract itself. That belongs to `prd-34-agent-operating-budget.md`.

## What Mastra Gives Us

### Agents

From the installed Mastra types:
- `Agent.generate()` accepts `maxSteps`
- `Agent.generate()` accepts `onStepFinish`
- `Agent.generate()` also supports `savePerStep`

This means one agent run can:
- be limited to a certain number of internal steps
- notify us after each step
- let us record cost and execution progress step by step

Relevant local references:
- `node_modules/@mastra/core/dist/agent/types.d.ts`
- `node_modules/@mastra/core/dist/agent/agent.d.ts`

### Workflows

Mastra workflows support:
- `.sleep()`
- `.sleepUntil()`
- persistent workflow runs
- `createRunAsync()` for fire-and-forget execution

Relevant local references:
- `node_modules/@mastra/core/dist/workflows/workflow.d.ts`

Relevant official reference:
- https://mastra.ai/workflows

## Important Distinction

There are two different things here:

### 1. Internal Agent Steps
These are the sequential LLM/tool steps inside a single `agent.generate()` call.

### 2. Repeated Agent Executions Over Time
These are separate runs of the agent spaced over minutes, hours, or days.

For the budget contract idea, the second one is the real control point.

## Key Finding

Mastra gives us hooks around steps inside a run, but a single `agent.generate()` call is still a normal active execution.
It is not the right primitive to keep one agent run alive and paused across 7 days.

So the correct model is:
- do not try to keep one `generate()` call alive for the whole contract
- instead, split execution into repeated runs
- after each run, calculate the next allowed execution time
- trigger the next run later

## Recommended Approach

### Treat each budget-controlled unit as a separate agent run

Use the contract budget to control when the next run is allowed.

Each run should:
1. execute the agent
2. record cost
3. update budget consumption
4. calculate the next execution time
5. schedule the next run

This means the pacing is between runs, not by trying to pause the middle of one long run for hours.

## How to Use Mastra for This

### Option A: App Scheduler + Agent Runs

This is the simplest fit for the current system.

Flow:
1. app decides an agent is due to run
2. app calls `agent.generate(...)`
3. use `maxSteps` to limit how much work happens in one run
4. use `onStepFinish` to record actual step cost
5. when the run finishes, compute `nextRunAt`
6. scheduler waits until `nextRunAt`
7. app starts another run

This works well with the current app architecture because:
- runtime composition is already in the app
- wake/external activity is already app-driven
- budget logic is also an application concern

### Option B: Mastra Workflow as the Scheduler

This is the more Mastra-native orchestration approach.

Flow:
1. create a workflow for budget-paced execution
2. workflow runs one agent execution step
3. workflow records cost and remaining budget
4. workflow calculates `nextRunAt`
5. workflow calls `.sleepUntil(nextRunAt)`
6. workflow wakes later and runs the agent again
7. repeat until contract end or budget exhaustion

This is attractive because:
- the waiting state is explicit
- the long-running orchestration is persistent
- the execution history belongs to one workflow run

## Recommendation

### Start with Option A

For this codebase, the first implementation should be:
- app-level scheduler
- repeated `agent.generate()` calls
- `maxSteps` set deliberately
- `onStepFinish` used to record technical execution cost

Reason:
- simpler
- matches the current architecture
- no need to redesign agent execution around workflows immediately
- easier to connect to the contract budget system

### Keep Option B as the next step

If later we want:
- a more explicit persistent orchestration model
- better long-lived execution visibility
- budget pacing as a formal runtime loop

then moving this into a Mastra workflow with `.sleepUntil()` makes sense.

## Recommended First Technical Shape

### Contract Runtime Loop

A simple loop can be modeled as:
1. pick active contract
2. check remaining budget
3. check remaining contract time
4. calculate run allowance
5. execute one bounded agent run
6. record spend
7. calculate `nextRunAt`
8. wait until `nextRunAt`
9. repeat

### Agent Run Boundaries

For the first version:
- keep `maxSteps` low and explicit
- likely `maxSteps: 1` or another small number

Why:
- cost becomes easier to attribute
- pacing becomes easier to reason about
- one run does not consume too much budget unpredictably

## How to Record Cost

The simplest technical way is:
- run the agent with `onStepFinish`
- after each step, read usage/cost data if available from the result/context we receive
- accumulate spend for that run
- persist run spend against the active contract

If exact provider cost is not available at first:
- store estimated cost per step/run
- keep the persistence model the same
- swap in better cost accounting later

## What Not to Do

Do not try to:
- keep one `agent.generate()` alive across the 7-day contract
- pause internal steps for long time intervals inside one run
- use the agent's own internal loop as the 7-day scheduler

That would make the runtime harder to reason about and harder to recover.

## Final Direction

For this feature, the clean mental model is:
- the contract budget controls when the next agent run is allowed
- one run is bounded with `maxSteps`
- step callbacks are used for accounting
- repeated execution over time is handled outside the agent's internal loop

That gives us a simple first implementation and still keeps a clean path open to a future workflow-based scheduler.
