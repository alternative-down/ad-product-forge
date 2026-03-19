# PRD-34: Agent Operating Budget

## Objective

Create a simple operating budget system for agents in the digital company.

The company has a cash balance. When an agent is hired, part of that balance is reserved for a 7-day contract period. That reserved value is used internally by the application to control the pace of the agent's execution.

The budget is not visible to the agent and is not a wallet owned by the agent. It is only an internal application control.

## Core Idea

- The company has a cash balance.
- Hiring an agent creates a 7-day contract.
- Creating the contract deducts an amount from company cash.
- That amount becomes the agent's operating budget for the contract period.
- Each execution step consumes part of that budget based on model cost.
- The system uses remaining budget and remaining time to control execution pacing.
- The budget can be increased during the active period.
- Auto-renew only happens at the end of the contract period, never in the middle.

## Scope

This document covers only the simple operating budget model and its runtime execution loop.

It does not define:
- advanced execution policies
- permission rules
- complex financial accounting
- agent-visible budget behavior
- exception handling beyond the basic runtime loop

## Main Concepts

### Company Cash

The company has a single cash balance.

The company cash ledger itself is defined in `PRD-08: Company Cash Ledger`.

This PRD depends on that ledger for:
- contract funding
- contract renewal
- contract top-up

### Agent Contract

An agent contract defines a fixed operating period.

For now:
- duration is 7 days
- it has a reserved budget in USD
- it may have auto-renew enabled or disabled

### Operating Budget

The operating budget is the reserved execution budget for that contract period.

It is:
- internal to the application
- consumed by agent execution
- not exposed to the agent

### Step Cost

Each step consumes part of the contract budget.

The consumed amount is based on model pricing in USD.

This includes not only the agent execution itself, but also other LLM-backed internal operations such as:
- OM
- future LTM processing

## Data Model Direction

A minimal model can be built around these records:

### `agent_execution_contracts`
Tracks the active and historical contract periods for agents.

Suggested fields:
- `id`
- `agentId`
- `startsAt`
- `endsAt`
- `budgetUsd`
- `autoRenew`
- `fundedAt`

### `agent_execution_steps`
Tracks step-level cost consumption.

This table is only for agent execution and agent-owned internal LLM work.

It does not include workflow-only costs such as the hiring workflow from `PRD-03`.

Suggested fields:
- `id`
- `contractId`
- `agentId`
- `modelKey`
- `kind`
- `inputTokens`
- `cachedInputTokens`
- `outputTokens`
- `costUsd`
- `createdAt`

`kind` values for the first version:
- `agent-step`
- `om`
- `ltm`

### `llm_model_prices`
Tracks model pricing in USD.

The key format should match the runtime model format used by Mastra:
- `gateway/provider/modelId`
- or `provider/modelId`

Suggested fields:
- `modelKey`
- `inputPerMillionUsd`
- `inputCachePerMillionUsd`
- `outputPerMillionUsd`

All values are stored in USD.

## Boundary with PRD-08

This PRD does not define the company ledger itself.

`PRD-08` is responsible for:
- company cash entries
- company cash outflows
- current balance
- projected balance
- financial snapshots

`PRD-34` is responsible for:
- reserving part of company cash into an agent contract
- consuming that contract budget through execution
- controlling pacing from the remaining contract budget

In practice:
- contract funding, renewal, and top-up should create ledger entries in `PRD-08`
- the contract runtime described here consumes the budget reserved by those financial movements

## Agent Runtime State

The agent has a simple execution state:
- `idle`
- `running`

This execution state can be stored on the agent itself.

It does not need a separate runtime table for:
- next execution timestamp
- pacing value
- last delay

Those values are derived when the loop runs.

## State Rules

### `idle`
The agent is idle when:
- it never executed a run yet
- or the most recent step finished with only response text and no tool calls

### `running`
The agent is running when:
- the current logical run has not finished yet
- the most recent step still produced tool calls
- or the run is waiting for budget to continue

`running` and `idle` belong only to the logical run state.

They do not describe contract state.

## Core Execution Rule

The system does not keep one `generate()` call open.

Instead:
- the application re-executes the agent in a loop
- each loop iteration runs exactly one bounded step

Execution call shape:
- `agent.generate([], { maxSteps: 1, ... })`

The continuation comes from the agent thread/memory, not from sending a new prompt each time.

## Step Continuation Rule

The stop/continue rule is simple:
- if the step returns tool calls, the agent stays in `running`
- if the step returns only text and no tool calls, the agent goes back to `idle`

In short:
- tool call = continue
- text only = stop

## Wake Behavior

External events do not execute the agent directly.

They only go through the wake mechanism already used by the application.

So:
- new events trigger wake
- if the agent is already running, new events do not directly start a new execution
- they only become part of what the agent will see in the next step

## Entry Into Running

When the agent goes from `idle` to `running`:
- an in-memory flag `instant` is set to `true`
- the first loop iteration still calculates the delay
- but if execution is allowed, the first wait becomes `0`
- after the first iteration, `instant = false`

This `instant` flag:
- starts as `false`
- is only used when entering `running`
- is not persisted
- after application restart, if the agent was already `running`, `instant` remains `false`

## Pacing Rule

The system should not use a fixed execution interval.

Instead, it should calculate pacing from:
- remaining contract budget
- remaining time until contract end
- estimated step cost

Simple formula for the first version:
- `stepsPossible = remainingBudget / estimatedStepCost`
- `delay = remainingTime / stepsPossible`

This means:
- if there is more budget remaining, the agent can execute more often
- if there is less budget remaining, the agent executes less often

## Estimated Step Cost

A simple heuristic is enough for the first version.

Use:
- `inputEstimatedUsd = lastStepInputTokens * currentModelInputCost`
- `averageStepUsd = average of last X step records for the agent`
- `estimatedStepUsd = (inputEstimatedUsd + averageStepUsd) / 2`

Notes:
- this intentionally ignores cache hit in the estimate
- that makes the estimate slightly conservative
- the average of recent steps brings the estimate closer to reality
- a small overrun in one step is acceptable and can be absorbed in later periods

### History Window

Use:
- last `10` step records

This history is:
- independent of contract
- independent of model
- independent of kind
- just the last `10` records of the agent overall

### First Execution

For the very first execution with no history yet:
- do not block execution
- just allow it to run

## Budget Insufficiency Behavior

Insufficient remaining budget does **not** end the logical run.

If the agent is already `running` and budget is insufficient:
- it stays in `running`
- it does not execute the next step yet
- it waits and retries later

Reason:
- the run has not finished logically
- it is only temporarily unable to advance

## Backoff While Budget Is Insufficient

When the agent is `running` but cannot execute because budget is insufficient:
- use exponential backoff
- initial backoff: `60s`
- maximum backoff: `10 minutes`

This backoff resets when the agent is able to execute a step again.

## Contract End Behavior

If the contract ends while the agent is still `running`:

### if `autoRenew = true`
- renew the contract at period end
- continue the loop

The renewed contract becomes the active contract immediately for the next loop calculation.

### if `autoRenew = false`
- keep the agent in `running`
- do not execute new steps until there is a valid contract condition again
- continue using the wait/retry loop

This keeps the logical run alive even if financial conditions temporarily block execution.

## Budget Top-Up Behavior

If budget is added while the agent is already `running`:
- nothing special happens immediately
- on the next loop iteration, the delay is recalculated using the updated budget data
- if conditions allow, execution continues normally

## Implementation Status

**Status:** Partially Implemented

Implemented today:
- `agent_execution_contracts` exists
- `agent_execution_steps` exists
- `llm_model_prices` exists
- agent execution state is stored directly on the agent row as:
  - `idle`
  - `running`
- the internal runner:
  - wakes through the existing wake queue
  - runs `generate([], { maxSteps: 1 })`
  - records step cost
  - records OM cost from OM data parts returned by the step result
  - returns to `idle` on text-only completion
  - stays in `running` on tool-call continuation
- first-step `instant` behavior is implemented in memory
- funding of active contracts is implemented through the company cash ledger
- auto-renew at period end is implemented in the runner/store flow
- active contract top-up is implemented and debited from company cash

Current implementation notes:
- contract rows use `fundedAt` instead of a separate contract status
- hiring creates the first contract but does not fund it directly
- the runner resolves a runnable contract before each step
- if no funded runnable contract is available, the runner stays in backoff

Still pending:
- future LTM cost registration into `agent_execution_steps`
- richer reporting or management views over contract history and spend

## Idle Wake Without Budget

If the agent is `idle` and receives wake, but there is no active contract budget available yet:
- it still transitions to `running`
- the loop starts
- execution waits until budget conditions allow progress

Reason:
- the wake represents pending work
- the run has started logically even if it cannot advance immediately

## Execution Loop Shape

A simple mental model for the runtime loop is:

1. if agent becomes `idle -> running`, set `instant = true`
2. while state is `running`
3. calculate estimated step cost
4. calculate remaining budget
5. calculate remaining time
6. if budget is insufficient, wait using backoff and continue loop
7. calculate delay from pacing formula
8. if `instant = true`, wait `0`; otherwise wait `delay`
9. run `agent.generate([], { maxSteps: 1, ... })`
10. record the real step cost
11. if no tool calls were returned, set state to `idle`
12. otherwise keep `running`
13. set `instant = false`

## Rules Summary

- Agent budget is internal only.
- Agent budget is not a wallet.
- Budget is reserved from company cash when the contract is created.
- Execution consumes contract budget step by step.
- Budget top-up during the active period is allowed.
- Auto-renew only happens when the current period ends.
- The loop uses `generate([], { maxSteps: 1 })`.
- Tool call means continue.
- Text only means stop.
- Budget insufficiency does not end the run.
- Waiting and retrying is part of `running`.
- Pacing is recalculated at every step.
- `running` / `idle` belong to the logical run, not to the contract lifecycle.

## Summary

This feature introduces a prepaid operating budget for agents.

The company funds a 7-day contract.
The application consumes that budget as the agent executes steps.
The application keeps the agent in a simple `idle` / `running` model and re-executes one step at a time with `maxSteps: 1`.

The pacing is calculated from remaining budget and remaining time.
If budget is temporarily insufficient, the run does not terminate; it waits and retries with backoff.

This keeps the system simple while matching the idea of a digital company that hires agents with a limited execution budget.
