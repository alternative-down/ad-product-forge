import { and, eq, gte, lte } from 'drizzle-orm';
import { forgeDebug } from '@forge-runtime/core';

import type { Database } from '../database/client';
import { agentExecutionContracts } from '../database/schema';
import { createCompanyCashLedger } from '../finance/company-cash-ledger';
import { createCompanyCashOperations } from '../finance/company-cash-operations';
import { createAgentContractStore } from './agent-contract-store';
import { currentTimeMs } from '../utils/time';

import {
  CannotReduceBudgetBelowSpentError,
  InsufficientCompanyCashError,
  NoActiveContractError,
} from './adjust-agent-contract-budget.errors';

export async function adjustAgentContractBudget(
  db: Database,
  input: {
    agentId: string;
    newBudgetUsd: number;
  },
) {
  const companyCash = createCompanyCashLedger(db);
  const companyCashOperations = createCompanyCashOperations(db);
  const now = currentTimeMs();

  // Get the active contract
  const activeContract = await db.query.agentExecutionContracts.findFirst({
    where: and(
      eq(agentExecutionContracts.agentId, input.agentId),
      lte(agentExecutionContracts.startsAt, now),
      gte(agentExecutionContracts.endsAt, now),
    ),
  });

  if (activeContract === null || activeContract === undefined) {
    adjustAgentContractBudgetDebug('warn', 'adjustAgentContractBudget: no active contract', {
      agentId: input.agentId,
    });
    throw new NoActiveContractError(input.agentId);
  }

  const currentBudget = activeContract.budgetUsd;
  const budgetDelta = input.newBudgetUsd - currentBudget;

  // No change needed
  if (budgetDelta === 0) {
    return {
      agentId: input.agentId,
      contractId: activeContract.id,
      previousBudgetUsd: currentBudget,
      newBudgetUsd: input.newBudgetUsd,
      changeAmountUsd: 0,
      changeType: 'none' as const,
    };
  }

  // Upward adjustment (increase budget) - requires company cash
  if (budgetDelta > 0) {
    const currentBalanceUsd = await companyCash.getCurrentBalanceUsd();

    if (currentBalanceUsd < budgetDelta) {
      adjustAgentContractBudgetDebug('warn', 'adjustAgentContractBudget: insufficient company cash');
      throw new InsufficientCompanyCashError();
    }

    // Deduct from company cash and update budget atomically

    await db.transaction(async (tx) => {
      await companyCashOperations.recordCashOut(
        {
          type: 'agent-contract-budget-increase',
          amountUsd: budgetDelta,
          description: `Budget increase for contract ${activeContract.id}`,
          referenceType: 'agent-execution-contract',
          referenceId: activeContract.id,
        },
        tx,
      );

      await tx
        .update(agentExecutionContracts)
        .set({ budgetUsd: input.newBudgetUsd })
        .where(eq(agentExecutionContracts.id, activeContract.id));
    });

    agentContractBudgetDebug('info', `Budget increased by ${budgetDelta} USD (${currentBudget} -> ${input.newBudgetUsd})`, {
      agentId: input.agentId,
      contractId: activeContract.id,
    });

    return {
      agentId: input.agentId,
      contractId: activeContract.id,
      previousBudgetUsd: currentBudget,
      newBudgetUsd: input.newBudgetUsd,
      changeAmountUsd: budgetDelta,
      changeType: 'increase' as const,
    };
  }

  // Downward adjustment (decrease budget) - requires validation
  const contractStore = createAgentContractStore(db);
  const contractSpend = await contractStore.getContractSpend(activeContract.id);

  // New budget cannot be less than what's already spent
  if (input.newBudgetUsd < contractSpend) {
    throw new CannotReduceBudgetBelowSpentError(contractSpend, input.newBudgetUsd);
  }

  const refundAmount = Math.abs(budgetDelta);

  // Refund unused funds and update budget atomically

  await db.transaction(async (tx) => {
    await companyCashOperations.recordCashIn(
      {
        type: 'agent-contract-budget-decrease',
        amountUsd: refundAmount,
        description: `Budget decrease refund for contract ${activeContract.id}`,
        referenceType: 'agent-execution-contract',
        referenceId: activeContract.id,
      },
      tx,
    );

    await tx
      .update(agentExecutionContracts)
      .set({ budgetUsd: input.newBudgetUsd })
      .where(eq(agentExecutionContracts.id, activeContract.id));
  });

  agentContractBudgetDebug('info', `Budget decreased by ${refundAmount} USD (${currentBudget} -> ${input.newBudgetUsd})`, {
    agentId: input.agentId,
    contractId: activeContract.id,
  });

  return {
    agentId: input.agentId,
    contractId: activeContract.id,
    previousBudgetUsd: currentBudget,
    newBudgetUsd: input.newBudgetUsd,
    changeAmountUsd: -refundAmount,
    changeType: 'decrease' as const,
  };
}


function adjustAgentContractBudgetDebug(level: 'info' | 'warn' | 'error', message: string, context?: Record<string, unknown>): void {
  forgeDebug({
    scope: 'adjust-agent-contract-budget',
    level,
    message,
    context,
  });
}

function agentContractBudgetDebug(level: 'info' | 'warn' | 'error', message: string, context?: Record<string, unknown>): void {
  forgeDebug({
    scope: 'agent-contract-budget',
    level,
    message,
    context,
  });
}
