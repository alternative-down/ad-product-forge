import { and, eq, gte, lte } from 'drizzle-orm';
import { forgeDebug } from '@forge-runtime/core';


import type {Database} from '../database/schema';
import { agentExecutionContracts } from '../database/schema';
import { createCompanyCashLedger } from '../finance/company-cash-ledger';
import { createCompanyCashOperations } from '../finance/company-cash-operations';
import { createAgentContractStore } from './agent-contract-store';
import { currentTimeMs } from '../utils/time';

export async function adjustAgentContractBudget(
  db: Database,
  input: {
    agentId: string;
    newBudgetUsd: number;
  }
) {
  const companyCash = createCompanyCashLedger(db);
  const companyCashOperations = createCompanyCashOperations(db);
  const now = currentTimeMs();

  // Get the active contract
  let activeContract;
  try {
    activeContract = await db.query.agentExecutionContracts.findFirst({
      where: and(
        eq(agentExecutionContracts.agentId, input.agentId),
        lte(agentExecutionContracts.startsAt, now),
        gte(agentExecutionContracts.endsAt, now),
      ),
    });
  } catch (err) {
    forgeDebug({
      scope: 'agent-contract-budget',
      level: 'error',
      agentId: input.agentId,
      message: `Failed to query active contract: ${err instanceof Error ? err.message : String(err)}`,
    });
    forgeDebug({ scope: 'agent-contract-budget', level: 'error', message: 'agent-contract-budget: operation failed', error: err instanceof Error ? err.message : String(err) });
    throw err;
  }

  if (!activeContract) {
    forgeDebug({ scope: 'adjust-agent-contract-budget', level: 'warn', message: 'adjustAgentContractBudget: no active contract', context: { agentId: input.agentId } });
    throw new Error(`No active contract for agent: ${input.agentId}`);
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
    let currentBalanceUsd;
    try {
      currentBalanceUsd = await companyCash.getCurrentBalanceUsd();
    } catch (err) {
      forgeDebug({
        scope: 'agent-contract-budget',
        level: 'error',
        agentId: input.agentId,
        contractId: activeContract.id,
        message: `Failed to get company cash balance: ${err instanceof Error ? err.message : String(err)}`,
      });
      forgeDebug({ scope: 'agent-contract-budget', level: 'error', message: 'agent-contract-budget: operation failed', error: err instanceof Error ? err.message : String(err) });
      throw err;
    }

    if (currentBalanceUsd < budgetDelta) {
      forgeDebug({ scope: 'adjust-agent-contract-budget', level: 'warn', message: 'adjustAgentContractBudget: insufficient company cash' });
    throw new Error('Insufficient company cash for budget increase');
    }

    // Deduct from company cash and update budget atomically
    try {
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
    } catch (err) {
      forgeDebug({
        scope: 'agent-contract-budget',
        level: 'error',
        agentId: input.agentId,
        contractId: activeContract.id,
        message: `Budget increase transaction failed: ${err instanceof Error ? err.message : String(err)}`,
        context: { budgetDelta, newBudgetUsd: input.newBudgetUsd },
      });
      forgeDebug({ scope: 'agent-contract-budget', level: 'error', message: 'agent-contract-budget: operation failed', error: err instanceof Error ? err.message : String(err) });
      throw err;
    }

    forgeDebug({
      scope: 'agent-contract-budget',
      level: 'info',
      agentId: input.agentId,
      contractId: activeContract.id,
      message: `Budget increased by ${budgetDelta} USD (${currentBudget} -> ${input.newBudgetUsd})`,
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
  let contractSpend;
  try {
    contractSpend = await contractStore.getContractSpend(activeContract.id);
  } catch (err) {
    forgeDebug({
      scope: 'agent-contract-budget',
      level: 'error',
      agentId: input.agentId,
      contractId: activeContract.id,
      message: `Failed to get contract spend: ${err instanceof Error ? err.message : String(err)}`,
    });
    forgeDebug({ scope: 'agent-contract-budget', level: 'error', message: 'agent-contract-budget: operation failed', error: err instanceof Error ? err.message : String(err) });
    throw err;
  }

  // New budget cannot be less than what's already spent
  if (input.newBudgetUsd < contractSpend) {
    throw new Error(
      `Cannot reduce budget below spent amount (${contractSpend.toFixed(6)} USD). New budget must be at least ${contractSpend.toFixed(6)} USD.`,
    );
  }

  const refundAmount = Math.abs(budgetDelta);

  // Refund unused funds and update budget atomically
  try {
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
  } catch (err) {
    forgeDebug({
      scope: 'agent-contract-budget',
      level: 'error',
      agentId: input.agentId,
      contractId: activeContract.id,
      message: `Budget decrease transaction failed: ${err instanceof Error ? err.message : String(err)}`,
      context: { refundAmount, newBudgetUsd: input.newBudgetUsd },
    });
    forgeDebug({ scope: 'agent-contract-budget', level: 'error', message: 'agent-contract-budget: operation failed', error: err instanceof Error ? err.message : String(err) });
    throw err;
  }

  forgeDebug({
    scope: 'agent-contract-budget',
    level: 'info',
    agentId: input.agentId,
    contractId: activeContract.id,
    message: `Budget decreased by ${refundAmount} USD (${currentBudget} -> ${input.newBudgetUsd})`,
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