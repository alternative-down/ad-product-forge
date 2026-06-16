import { errorMsg } from './error-formatting';
import { and, eq, gte, lte } from 'drizzle-orm';
import { forgeDebug } from '@forge-runtime/core';

import type { Database } from '../database/client';
import { currentTimeMs } from '../utils/time';
import { agentExecutionContracts, type AgentExecutionContract } from '../database/schema';
import { createCompanyCashLedger } from '../finance/company-cash-ledger';
import { createCompanyCashOperations } from '../finance/company-cash-operations';

export async function topUpActiveAgentContract(
  db: Database,
  input: {
    agentId: string;
    amountUsd: number;
  },
) {
  const companyCash = createCompanyCashLedger(db);
  const companyCashOperations = createCompanyCashOperations(db);
  const now = currentTimeMs();

  let activeContract: AgentExecutionContract | null = null;

  try {
    activeContract = (await db.query.agentExecutionContracts.findFirst({
      where: and(
        eq(agentExecutionContracts.agentId, input.agentId),
        lte(agentExecutionContracts.startsAt, now),
        gte(agentExecutionContracts.endsAt, now),
      ),
    })) ?? null;
  } catch (err) {
    forgeDebug({
      scope: 'top-up-agent-contract',
      level: 'error',
      runtimeId: input.agentId,
      message: 'Failed to find active contract: ' + errorMsg(err),
    });
    throw err;
  }

  if (activeContract === null || activeContract === undefined) {
    forgeDebug({
      scope: 'top-up-agent-contract',
      level: 'warn',
      message: 'topUpAgentContract: no active contract',
      context: { agentId: input.agentId },
    });
    throw new Error(`No active contract for agent: ${input.agentId}`);
  }

  // TS narrows activeContract to AgentExecutionContract here (non-null + non-undefined).
  // Capture to a const so async-callback scope (line 81+ in original) inherits the narrowing
  // without needing the '!' non-null assertion. L#19 invariant.
  const contract = activeContract;

  let currentBalanceUsd: number;

  try {
    currentBalanceUsd = await companyCash.getCurrentBalanceUsd();
  } catch (err) {
    forgeDebug({
      scope: 'top-up-agent-contract',
      level: 'error',
      runtimeId: input.agentId,
      message: 'Failed to get company cash balance: ' + errorMsg(err),
    });
    throw err;
  }

  if (currentBalanceUsd < input.amountUsd) {
    forgeDebug({
      scope: 'top-up-agent-contract',
      level: 'warn',
      message: 'topUpAgentContract: insufficient company cash',
    });
    throw new Error('Insufficient company cash for contract top-up');
  }

  try {
    await db.transaction(async (tx: any) => {
      await companyCashOperations.recordCashOut(
        {
          type: 'agent-contract-topup',
          amountUsd: input.amountUsd,
          description: `Contract top-up for ${input.agentId}`,
          referenceType: 'agent-execution-contract',
          referenceId: contract.id,
        },
        tx,
      );

      await tx
        .update(agentExecutionContracts)
        .set({ budgetUsd: contract.budgetUsd + input.amountUsd })
        .where(eq(agentExecutionContracts.id, contract.id));
    });
  } catch (err) {
    forgeDebug({
      scope: 'top-up-agent-contract',
      level: 'error',
      runtimeId: input.agentId,
      message:
        'Failed to record cash out or update contract: ' + errorMsg(err),
    });
    throw err;
  }

  return {
    agentId: input.agentId,
    contractId: activeContract.id,
    budgetUsd: activeContract.budgetUsd + input.amountUsd,
  };
}
