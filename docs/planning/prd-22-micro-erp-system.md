# PRD-22: Micro ERP for Internal Agents

**Classification:** FORGE APP

## 1. Goal

Provide internal agents with a simple administrative view of the company.

This module exists so agents can inspect:
- company cash movements
- current cash balance
- scheduled future cash movements
- active internal-agent contracts and their weekly value

It does **not** exist to expose runtime internals, execution telemetry, or budget-control mechanics.

## 2. Scope

### Included
- company cash ledger entries
- current company cash balance
- future ledger entries that are already scheduled
- active internal-agent contracts
- weekly contract value for each active internal agent

### Excluded
- step-by-step LLM cost
- OM/LTM execution cost details
- contract funding state internals
- remaining contract budget
- pacing logic
- free-form SQL/query execution by agents
- custom agent-defined views
- dashboard UI
- accounting/export integrations

## 3. Agent-Facing Capabilities

### 3.1 Get Cash Balance
Return the current company cash balance derived from the ledger.

Example output shape:
```ts
{
  balanceUsd: number;
}
```

### 3.2 List Cash Movements
Return ledger entries with optional filters.

Supported filters:
- date range
- direction (`in` or `out`)
- status
- type
- limit
- offset

Example output shape:
```ts
{
  items: Array<{
    id: string;
    type: string;
    direction: 'in' | 'out';
    amountUsd: number;
    description?: string;
    status: string;
    dueAt?: number;
    effectiveAt?: number;
    createdAt: number;
  }>;
  total: number;
}
```

### 3.3 Get Cash Summary
Return a compact summary for a period.

Example output shape:
```ts
{
  periodStart: number;
  periodEnd: number;
  totalInUsd: number;
  totalOutUsd: number;
  netUsd: number;
  balanceUsd: number;
  scheduledInUsd: number;
  scheduledOutUsd: number;
}
```

### 3.4 List Active Agent Contracts
Return active internal-agent contracts with their weekly value.

Example output shape:
```ts
{
  items: Array<{
    contractId: string;
    agentId: string;
    agentName: string;
    startsAt: number;
    endsAt: number;
    weeklyBudgetUsd: number;
    autoRenew: boolean;
  }>;
}
```

### 3.5 Get Active Contract
Return the active contract for one internal agent.

Example output shape:
```ts
{
  contractId: string;
  agentId: string;
  agentName: string;
  startsAt: number;
  endsAt: number;
  weeklyBudgetUsd: number;
  autoRenew: boolean;
} | null
```

## 4. Data Sources

### 4.1 Company Cash Ledger
Use the existing company ledger as the source of truth:
- `company_cash_ledger`

Relevant fields:
- `id`
- `type`
- `direction`
- `amountUsd`
- `description`
- `status`
- `dueAt`
- `effectiveAt`
- `createdAt`
- `referenceType`
- `referenceId`

### 4.2 Internal-Agent Contracts
Use the existing execution contracts table only as an administrative contract source:
- `agent_execution_contracts`
- joined with `agents`

Relevant fields:
- `id`
- `agentId`
- `budgetUsd`
- `autoRenew`
- `startsAt`
- `endsAt`

Important:
- `budgetUsd` is exposed here only as the weekly contract value
- internal funding state and remaining budget are not part of the micro ERP surface

## 5. Boundaries

### What the Micro ERP can expose
- financial movements
- company balance
- scheduled future movements
- active contracts
- weekly contract values

### What must stay internal to the runtime
- `agent_execution_steps`
- per-step token usage
- OM/LTM cost rows
- runner pacing and backoff
- contract executable/funded resolution
- remaining budget calculations

## 6. Initial Implementation Shape

Start simple.

The first implementation should provide only fixed read operations through application code.

Suggested first surface:
- `getCompanyCashBalance()`
- `listCompanyCashMovements()`
- `getCompanyCashSummary()`
- `listActiveInternalAgentContracts()`
- `getActiveInternalAgentContract(agentId)`

These can later be exposed to agents as tools.

Do not start with:
- dynamic query builders
- custom saved views
- generalized reporting engine

## 7. Success Criteria

- internal agents can inspect the company cash balance
- internal agents can inspect recent and scheduled cash movements
- internal agents can inspect active contracts and weekly values
- no runtime-internal execution telemetry leaks through this module
- the surface stays small and explicit

## 8. Implementation Status

**Status:** Partially Implemented

Already available in the system today:
- `company_cash_ledger`
- `agent_execution_contracts`
- `agents`
- micro ERP read module in the app
- agent-facing tools for:
  - company cash balance
  - company cash movement list
  - company cash summary
  - active internal-agent contracts
  - active contract by agent

Still missing:
- review of the final agent-facing wording/output shapes after real usage
