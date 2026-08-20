/**
 * Typed Error subclasses for the agents/adjust-agent-contract-budget module (Pattern L, D51 #6502 batch 15).
 *
 * Replaces 3 raw `throw new Error(...)` calls in adjust-agent-contract-budget.ts
 * with 3 typed Error subclasses so consumers can use `err instanceof XError`
 * instead of parsing human-readable messages. See #6502.
 *
 * Migration impact: 3 literal `throw new Error(...)` calls in
 * apps/forge/src/agents/adjust-agent-contract-budget.ts collapse to 3 typed Error classes.
 * Message format is preserved verbatim for backward compatibility with
 * existing `.rejects.toThrow(<substring>)` and `.rejects.toThrow(<regex>)` tests
 * in adjust-agent-contract-budget.test.ts.
 *
 * Pattern reference: apps/forge/src/finance/payment-receivables.errors.ts (D51 batch 14 — Varek),
 * apps/forge/src/encryption/crypto.errors.ts (D51 batch 13 — Varek).
 */

export class NoActiveContractError extends Error {
  readonly code = 'NO_ACTIVE_CONTRACT' as const;
  readonly agentId: string;
  constructor(agentId: string) {
    super(`No active contract for agent: ${agentId}`);
    this.name = 'NoActiveContractError';
    this.agentId = agentId;
  }
}

export class InsufficientCompanyCashError extends Error {
  readonly code = 'INSUFFICIENT_COMPANY_CASH' as const;
  constructor() {
    super('Insufficient company cash for budget increase');
    this.name = 'InsufficientCompanyCashError';
  }
}

export class CannotReduceBudgetBelowSpentError extends Error {
  readonly code = 'CANNOT_REDUCE_BUDGET_BELOW_SPENT' as const;
  readonly contractSpendUsd: number;
  readonly newBudgetUsd: number;
  constructor(contractSpendUsd: number, newBudgetUsd: number) {
    super(
      `Cannot reduce budget below spent amount (${contractSpendUsd.toFixed(6)} USD). New budget must be at least ${contractSpendUsd.toFixed(6)} USD.`,
    );
    this.name = 'CannotReduceBudgetBelowSpentError';
    this.contractSpendUsd = contractSpendUsd;
    this.newBudgetUsd = newBudgetUsd;
  }
}
