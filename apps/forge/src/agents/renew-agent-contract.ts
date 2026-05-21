
import { serializeError } from './agent-runner-error-formatting';
import { eq } from 'drizzle-orm';
import { forgeDebug } from '@forge-runtime/core';

import type { Database } from '../database/schema';
import { agentExecutionContracts } from '../database/schema';
import { createCompanyCashLedger } from '../finance/company-cash-ledger';
import { createCompanyCashOperations } from '../finance/company-cash-operations';
import { createAgentContractStore } from './agent-contract-store';
import { currentTimeMs } from '../utils/time';
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
  const now = currentTimeMs();

  try {
    const activeContract = await contractStore.getActiveContract(input.agentId);

    if (activeContract === null || activeContract === undefined) {
      forgeDebug({
        scope: 'renew-agent-contract',
        level: 'info',
        message: 'no-active-contract',
        context: { agentId: input.agentId },
      });
      throw new Error(`No active contract for agent: ${input.agentId}`);
    }

    const spentUsd = await contractStore.getContractSpend(activeContract.id);
    const refundableUsd =
      activeContract.fundedAt !== null && activeContract.fundedAt !== undefined
        ? Math.max(activeContract.budgetUsd - spentUsd, 0)
        : 0;
    const currentBalanceUsd = await companyCash.getCurrentBalanceUsd();
    // Refund is not yet committed — use raw balance without adding it
    const availableBalanceUsd = currentBalanceUsd + refundableUsd;

    if (availableBalanceUsd < input.newBudgetUsd) {
      forgeDebug({
        scope: 'renew-agent-contract',
        level: 'info',
        message: 'insufficient-balance',
        context: {
          agentId: input.agentId,
          availableBalanceUsd,
          requiredBudgetUsd: input.newBudgetUsd,
        },
      });
      throw new Error('Insufficient company cash to renew this contract');
    }

    const newContractId = createId();

    // All cash operations (refund old + fund new) and all contract operations
    // are inside the same transaction. If anything fails, everything rolls back.
    await db.transaction(async (tx: any) => {
      // Refund old contract inside tx — cash only actually moves if tx commits
      if (refundableUsd > 0) {
        await companyCashOperations.recordCashIn(
          {
            type: 'agent-contract-renewal-refund',
            amountUsd: refundableUsd,
            description: `Renewal refund for contract ${activeContract.id}`,
            referenceType: 'agent-execution-contract',
            referenceId: activeContract.id,
            effectiveAt: now,
          },
          tx,
        );
      }

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

    forgeDebug({
      scope: 'renew-agent-contract',
      level: 'info',
      message: 'success',
      context: {
        agentId: input.agentId,
        previousContractId: activeContract.id,
        newContractId,
        previousBudgetUsd: activeContract.budgetUsd,
        newBudgetUsd: input.newBudgetUsd,
        refundableUsd,
      },
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
  } catch (err) {
    forgeDebug({
      scope: 'renew-agent-contract',
      level: 'info',
      message: 'error',
      context: {
        error: serializeError(err),
        agentId: input.agentId,
      },
    });
    throw err;
  }
}
