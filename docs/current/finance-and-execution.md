# Finance and Execution

## Operating model

Forge currently models agent execution as a budgeted weekly operating contract.

This is implemented through:

- `agent_execution_contracts`
- `agent_execution_steps`
- `llm_model_prices`
- `company_cash_ledger`

## Contracts

Every hired internal agent receives an initial weekly contract.

Current contract behavior:

- weekly budget in USD
- auto-renew flag
- funded timestamp when applicable
- contract time window

The runner uses the active contract to decide whether the agent can keep executing.

## Step accounting

The runner records two kinds of execution cost:

- `agent-step`
- `om`

The current implementation estimates and records spend using the model price table and the actual token counts returned by execution.

## Runner pacing

Pacing is currently derived from:

- remaining contract budget
- recent average step cost
- remaining contract time window

If budget is insufficient, the runner does not continue immediately. It backs off and retries later.

## Company cash ledger

The ledger is the current company-level financial record.

Today it supports:

- funding operations
- spend-related recording
- manual payable scheduling
- recurring payable scheduling
- cash reads through the micro ERP tools

This is not yet a full external accounting integration.

## Admin finance operations

The human admin UI now owns the write surface for basic company cash maintenance.

Current admin-side write actions:

- register owner investment as a posted cash-in entry
- create one-off planned payables
- create recurring payables with an active recurrence plan
- post planned ledger entries
- cancel planned ledger entries
- pause or resume recurring payables

Recurring payables are stored separately from the ledger in `company_recurring_payables`.

Each recurring payable keeps:

- current recurrence period
- next due timestamp
- active state

When a planned recurring ledger entry is posted or canceled from the admin UI, Forge creates the next planned occurrence and advances `next_due_at`.

## Micro ERP

The micro ERP is a read-only agent-facing view over finance and contract state.

Current surface:

- cash balance
- cash movement listing
- cash summary by period
- active contract listing
- active contract lookup for a target agent

This is intentionally read-only. Agents do not write directly to the ledger through the micro ERP surface.
