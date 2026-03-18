# PRD-34: Agent Operating Budget

## Objective

Create a simple operating budget system for agents in the digital company.

The company has a cash balance. When an agent is hired, part of that balance is reserved for a 7-day operating period. This reserved value is used internally by the application to control the pace of the agent's execution.

The budget is not visible to the agent and is not a wallet owned by the agent. It is only an internal application control.

## Core Idea

- The company has a cash balance.
- Hiring an agent creates a 7-day contract.
- Creating the contract deducts an amount from company cash.
- That amount becomes the agent's operating budget for the contract period.
- Each execution consumes part of that budget based on model cost.
- The system uses remaining budget and remaining contract time to control execution pacing.
- The budget can be increased during the active period.
- Auto-renew only happens at the end of the contract period, never in the middle.

## Scope

This document covers only the simple operating budget model.

It does not define:
- advanced execution policies
- permission rules
- complex financial accounting
- agent-visible budget behavior
- exception handling for budget overruns

## Main Concepts

### Company Cash

The company has a single cash balance.

This balance is affected by:
- incoming money
- outgoing money
- agent contract funding

### Agent Contract

An agent contract defines a fixed operating period.

For now:
- duration is 7 days
- it has a reserved budget
- it may have auto-renew enabled or disabled

### Operating Budget

The operating budget is the reserved execution budget for that contract period.

It is:
- internal to the application
- consumed by agent execution
- not exposed to the agent

### Execution Cost

Each execution consumes part of the contract budget.

The consumed amount is based on model cost.

## Expected Flow

### 1. Hire Agent

When an agent is hired:
- the application checks company cash
- deducts the chosen amount from company cash
- creates a 7-day contract
- assigns that amount as the contract operating budget

### 2. Execute Agent

When the agent runs:
- the application calculates execution cost
- deducts that cost from the active contract budget
- recalculates pacing based on remaining budget and remaining time in the 7-day period

### 3. Add More Budget During Active Contract

If more budget is added during the contract:
- the contract budget increases
- remaining budget increases
- pacing is recalculated
- the agent can run faster

### 4. Contract End

When the 7-day period ends:
- if auto-renew is disabled, the contract ends
- if auto-renew is enabled, the application creates a new 7-day contract period and deducts the renewal amount from company cash

Auto-renew must happen only at the end of the period.

## Pacing Rule

The system should not use a fixed execution interval.

Instead, it should calculate pacing from:
- remaining contract budget
- remaining time until contract end
- recent execution cost

Simple intent:
- more remaining budget with less time left means the agent can run faster
- less remaining budget with more time left means the agent should run slower

## Data Model Direction

A minimal model can be built around these records:

### company_cash_ledger
Tracks company-level money movements.

Examples:
- incoming funds
- outgoing funds
- contract funding
- contract renewal funding

### agent_contracts
Tracks the active and historical contract periods for agents.

Suggested fields:
- `id`
- `agentId`
- `startsAt`
- `endsAt`
- `budgetAmount`
- `autoRenew`
- `status`

### agent_contract_costs
Tracks consumption of contract budget.

Suggested fields:
- `id`
- `contractId`
- `agentId`
- `runId` or `stepId`
- `costAmount`
- `createdAt`

## Rules

- Agent budget is internal only.
- Agent budget is not a wallet.
- Budget is reserved from company cash when the contract is created.
- Execution consumes contract budget.
- Budget top-up during the active period is allowed.
- Auto-renew only happens when the current period ends.
- Pacing is derived from remaining budget and remaining time.

## Open Questions

These are intentionally left open for a later pass:
- exact cost calculation model
- exact pacing formula
- how to represent estimated cost versus real cost
- whether cost is recorded per step, per run, or both
- whether top-up creates a ledger entry only or also a contract event record

## Summary

This feature introduces a prepaid operating budget for agents.

The company funds the contract.
The application consumes that budget as the agent executes.
The application uses the remaining budget over the remaining contract time to control how quickly the agent runs.

This keeps the model simple while matching the idea of a digital company that hires agents with a limited execution budget.
