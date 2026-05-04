import { and, eq, gte, lte } from 'drizzle-orm';

import type { Database } from '../database/index';
import { agentExecutionContracts } from '../database/schema';
import { createCompanyCashLedger } from '../finance/company-cash-ledger';
import { createCompanyCashOperations } from '../finance/company-cash-operations';
import { createAgentContractStore } from './agent-contract-store';
import { createId } from '../utils/id';
import { WEEK_MS } from '../shared/constants';


export async function renewAgentContract(
  db: Database,
  input: {
    agentId: string;
    newBudgetUsd: number;
  },
) {
  const companyCash = createCompanyCashLedger(db);
  const companyCashOperations = createCompanyCashOperations(db);
  const contractStore = createAgentContractStore(db);
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

  const spentUsd = await contractStore.getContractSpend(activeContract.id);
  const refundableUsd = activeContract.fundedAt
    ? Math.max(activeContract.budgetUsd - spentUsd, 0)
    : 0;
  const currentBalanceUsd = await companyCash.getCurrentBalanceUsd();
  const availableBalanceUsd = currentBalanceUsd + refundableUsd;

  if (availableBalanceUsd < input.newBudgetUsd) {
    throw new Error('Insufficient company cash to renew this contract');
  }

  const newContractId = createId();

  // Refund old contract if funded
  if (refundableUsd > 0) {
    await companyCashOperations.recordCashIn({
      type: 'agent-contract-renewal-refund',
      amountUsd: refundableUsd,
      description: `Renewal refund for contract ${activeContract.id}`,
      referenceType: 'agent-execution-contract',
      referenceId: activeContract.id,
      effectiveAt: now,
    });
  }

  // Close old contract, create new, and fund it atomically
  await db.transaction(async (tx) => {
    // Close old contract
    await tx
      .update(agentExecutionContracts)
      .set({ endsAt: now })
      .where(eq(agentExecutionContracts.id, activeContract.id));

    // Create new contract
    await tx.insert(agentExecutionContracts).values({
      id: newContractId,
      agentId: input.agentId,
      budgetUsd: input.newBudgetUsd,
      autoRenew: activeContract.autoRenew,
      fundedAt: null,
      startsAt: now,
      endsAt: now + WEEK_MS,
      createdAt: now,
    });

    // Fund new contract — must be in same tx as contract creation
    await companyCashOperations.recordCashOut(
      {
        type: 'agent-contract-renewal-funding',
        amountUsd: input.newBudgetUsd,
        description: `Renewal funding for contract ${newContractId}`,
        referenceType: 'agent-execution-contract',
        referenceId: newContractId,
        effectiveAt: now,
      },
      tx,
    );

    // Mark new contract as funded
    await tx
      .update(agentExecutionContracts)
      .set({ fundedAt: now })
      .where(eq(agentExecutionContracts.id, newContractId));
  });

  return {
    agentId: input.agentId,
    previousContractId: activeContract.id,
    newContractId,
    previousBudgetUsd: activeContract.budgetUsd,
    previousSpentUsd: spentUsd,
    refundedUsd: refundableUsd,
    newBudgetUsd: input.newBudgetUsd,
    startsAt: now,
    endsAt: now + WEEK_MS,
  };
}
