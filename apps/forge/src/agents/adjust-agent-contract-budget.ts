import { and, eq, gte, lte } from 'drizzle-orm';

import type { Database } from '../database/index';
import { agentExecutionContracts } from '../database/schema';
import { createCompanyCashLedger } from '../finance/company-cash-ledger';
import { createCompanyCashOperations } from '../finance/company-cash-operations';
import { createAgentContractStore } from './agent-contract-store';

export async function adjustAgentContractBudget(
  db: Database,
  input: {
    agentId: string;
    newBudgetUsd: number;
  }
) {
  const companyCash = createCompanyCashLedger(db);
  const companyCashOperations = createCompanyCashOperations(db);
  const now = Date.now();

  const activeContract = await db.query.agentExecutionContracts.findFirst({
    where: and(
      eq(agentExecutionContracts.agentId, input.agentId),
      lte(agentExecutionContracts.startsAt, now),
      gte(agentExecutionContracts.endsAt, now),
    ),
  });

  if (!activeContract) {
    throw new Error(`No active contract for agent: ${input.agentId}`);
  }

  const currentBudget = activeContract.budgetUsd;
  const budgetDelta = input.newBudgetUsd - currentBudget;

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

  // Upward adjustment — deduct from company cash and update budget atomically
  if (budgetDelta > 0) {
    const currentBalanceUsd = await companyCash.getCurrentBalanceUsd();

    if (currentBalanceUsd < budgetDelta) {
      throw new Error('Insufficient company cash for budget increase');
    }

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
        .set({
          budgetUsd: input.newBudgetUsd,
        })
        .where(eq(agentExecutionContracts.id, activeContract.id));
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

  // Downward adjustment — refund to company cash and update budget atomically
  const contractStore = createAgentContractStore(db);
  const contractSpend = await contractStore.getContractSpend(activeContract.id);

  if (input.newBudgetUsd < contractSpend) {
    throw new Error(
      `Cannot reduce budget below spent amount (${contractSpend.toFixed(6)} USD). New budget must be at least ${contractSpend.toFixed(6)} USD.`,
    );
  }

  const refundAmount = Math.abs(budgetDelta);

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
      .set({
        budgetUsd: input.newBudgetUsd,
      })
      .where(eq(agentExecutionContracts.id, activeContract.id));
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
