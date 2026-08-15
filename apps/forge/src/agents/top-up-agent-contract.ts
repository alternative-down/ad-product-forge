import { errorMsg } from './error-formatting';
import { and, eq, gte, lte } from 'drizzle-orm';
import { topUpAgentContractDebug } from './top-up-agent-contract-debug';

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
    topUpAgentContractDebug('error', 'Failed to find active contract: ', { error: errorMsg(err), runtimeId: input.agentId });
    throw err;
  }

  if (activeContract === null || activeContract === undefined) {
    topUpAgentContractDebug('warn', 'topUpAgentContract: no active contract', { agentId: input.agentId });
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
    topUpAgentContractDebug('error', 'Failed to get company cash balance: ', { error: errorMsg(err), runtimeId: input.agentId });
    throw err;
  }

  if (currentBalanceUsd < input.amountUsd) {
    topUpAgentContractDebug('warn', 'topUpAgentContract: insufficient company cash');
    throw new Error('Insufficient company cash for contract top-up');
  }

  try {
    await db.transaction(async (tx) => {
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
    topUpAgentContractDebug('error', 'Failed to record cash out or update contract: ', { error: errorMsg(err), runtimeId: input.agentId });
    throw err;
  }

  return {
    agentId: input.agentId,
    contractId: activeContract.id,
    budgetUsd: activeContract.budgetUsd + input.amountUsd,
  };
}
