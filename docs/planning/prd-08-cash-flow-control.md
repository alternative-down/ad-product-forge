# PRD-08: Company Cash Ledger

**Status:** Partially Implemented
**Data:** 2026-03-18
**Versão:** 2.0

## Objective

Define the financial record structure that composes the company cash position.

This document is only about company cash registration.
It does not define budgets, pacing, throttling, or other controls derived from the cash balance.

## Scope

This PRD covers:
- financial entries
- financial outflows
- future obligations
- current cash balance
- projected cash balance
- balance snapshots for efficient reads

This PRD does not cover:
- agent contract pacing
- global LLM usage throttling
- execution limits
- permission rules
- billing provider integrations

## Core Idea

The company cash should be represented by a ledger.

The ledger is the source of truth.
Each financial movement is recorded as an entry in the ledger.
The company balance is derived from those records.

A balance snapshot may exist as an optimization, but it is not the source of truth.

## Main Concepts

### Cash Ledger

A chronological record of company financial movements.

Each record represents one movement that affects or may affect company cash.

Examples:
- incoming payment
- operating expense
- salary or contractor payout
- software subscription
- agent contract funding
- agent contract renewal
- agent contract top-up

### Present and Future Records

The ledger must support both:
- movements that already happened
- movements expected to happen in the future

This allows the system to represent:
- current balance
- upcoming obligations
- simple cash projection

### Balance

The current company balance is derived from ledger entries that are already effective.

### Projected Balance

A projected balance can be calculated by including future scheduled entries.

### Balance Snapshot

A snapshot may be stored to avoid recalculating the entire ledger repeatedly.

The snapshot is an optimization only.
If needed, it must always be possible to recompute balance from the ledger.

## Data Model Direction

### `company_cash_ledger`

Suggested fields:
- `id`
- `type`
- `direction`
- `amountUsd`
- `description`
- `referenceType`
- `referenceId`
- `status`
- `dueAt`
- `effectiveAt`
- `createdAt`

### Field Notes

#### `type`
A simple business classification of the movement.

Examples:
- `revenue`
- `expense`
- `agent-contract-funding`
- `agent-contract-renewal`
- `agent-contract-topup`
- `manual-adjustment`

#### `direction`
Defines whether the movement adds to or removes from company cash.

Values:
- `in`
- `out`

#### `amountUsd`
The monetary amount in USD.

All values in this financial model should be stored in USD.

#### `referenceType` and `referenceId`
Optional fields used to connect a cash movement to another business object.

Examples:
- contract
- invoice
- subscription
- agent
- payment

This keeps the ledger generic while still allowing traceability.

#### `status`
Defines whether the record is only planned or already effective.

Initial simple values:
- `planned`
- `posted`
- `canceled`

#### `dueAt`
The expected date/time of the movement.
Useful for future obligations.

#### `effectiveAt`
The date/time when the movement actually affected company cash.
Useful for posted records.

## Balance Rules

### Current Balance

Current balance should be derived from ledger entries where:
- `status = posted`
- and the movement is already effective

### Future Projection

Projected balance may include:
- `planned` future entries
- `posted` future-dated entries if that becomes necessary later

For the first version, it is enough to support a simple projection from planned future entries.

## Snapshot Model

### `company_cash_balance_snapshot`

Suggested fields:
- `id`
- `balanceUsd`
- `asOf`
- `createdAt`

Purpose:
- speed up reads
- avoid recalculating the entire ledger every time

Rule:
- snapshot is a cache/optimization
- ledger remains the source of truth

## Example Flows

### Incoming Revenue

1. create ledger entry
2. `type = revenue`
3. `direction = in`
4. `status = posted`
5. set `effectiveAt`
6. balance increases

### Future Expense

1. create ledger entry
2. `type = expense`
3. `direction = out`
4. `status = planned`
5. set `dueAt`
6. this affects projected cash, not current cash yet

### Agent Contract Funding

1. create ledger entry
2. `type = agent-contract-funding`
3. `direction = out`
4. `status = posted`
5. set `effectiveAt`
6. reference the agent contract

## Design Rules

- The ledger is the source of truth.
- Balance is derived from the ledger.
- Snapshot is optional and only an optimization.
- The ledger must support present and future entries.
- The ledger should remain generic and not encode execution-control logic.
- Derived controls such as budgets, pacing, throttling, and execution policy belong in other modules and PRDs.

## What This Enables

This structure is enough to support later features such as:
- agent contract funding
- contract renewal
- contract top-up
- future payable obligations
- financial reporting
- simple cash forecasting

Without forcing those derived systems into the cash ledger itself.

## Summary

The company cash should be modeled as a financial ledger.

Every relevant money movement is recorded there.
The current balance is derived from posted records.
Future obligations are represented as planned records.
A balance snapshot may exist for efficiency, but the ledger remains the source of truth.

This keeps the financial model simple, extensible, and independent from the execution-control systems that will use it later.

## Implementation Status

Implemented today:
- `company_cash_ledger` exists in the Forge app database
- current balance is already derived from posted effective ledger records
- the ledger is already used for:
  - hiring process cost
  - contract funding
  - contract top-up
  - manual cash funding

Current implementation fields:
- `id`
- `type`
- `direction`
- `amountUsd`
- `description`
- `referenceType`
- `referenceId`
- `status`
- `dueAt`
- `effectiveAt`
- `createdAt`

Operational helpers already exist:
- manual funding script for company cash
- app-level ledger module used by hiring and contract runtime

Still pending:
- balance snapshot table
- projected cash helpers built on planned future entries
