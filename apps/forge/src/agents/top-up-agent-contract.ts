import { and, eq, gte, lte } from 'drizzle-orm';

import type { Database } from '../database/index.js';
import { agentExecutionContracts } from '../database/schema.js';
import { createCompanyCashLedger } from '../finance/company-cash-ledger.js';

export async function topUpActiveAgentContract(db: Database, input: {
  agentId: string;
  amountUsd: number;
}) {
  const companyCash = createCompanyCashLedger(db);
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

  const currentBalanceUsd = await companyCash.getCurrentBalanceUsd();

  if (currentBalanceUsd < input.amountUsd) {
    throw new Error('Insufficient company cash for contract top-up');
  }

  await companyCash.postEntry({
    type: 'agent-contract-topup',
    direction: 'out',
    amountUsd: input.amountUsd,
    description: `Contract top-up for ${input.agentId}`,
    referenceType: 'agent-execution-contract',
    referenceId: activeContract.id,
  });

  await db
    .update(agentExecutionContracts)
    .set({
      budgetUsd: activeContract.budgetUsd + input.amountUsd,
    })
    .where(eq(agentExecutionContracts.id, activeContract.id));

  return {
    agentId: input.agentId,
    contractId: activeContract.id,
    budgetUsd: activeContract.budgetUsd + input.amountUsd,
  };
}
