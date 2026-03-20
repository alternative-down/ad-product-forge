import { and, desc, eq, lte, gte, sql } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

import type { Database } from '../database/index.js';
import { agents, agentExecutionContracts, agentExecutionSteps, llmModelPrices } from '../database/schema.js';
import { createCompanyCashLedger } from '../finance/company-cash-ledger.js';
import { createCompanyCashOperations } from '../finance/company-cash-operations.js';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function createAgentContractStore(db: Database) {
  const companyCash = createCompanyCashLedger(db);
  const companyCashOperations = createCompanyCashOperations(db);

  async function getExecutionState(agentId: string) {
    const agent = await db.query.agents.findFirst({
      where: eq(agents.id, agentId),
    });

    return agent?.executionState ?? 'idle';
  }

  async function setExecutionState(agentId: string, executionState: 'idle' | 'running') {
    await db
      .update(agents)
      .set({
        executionState,
        updatedAt: Date.now(),
      })
      .where(eq(agents.id, agentId));
  }

  async function getRunnableContract(agentId: string) {
    const activeContract = await getActiveContract(agentId);

    if (activeContract) {
      return fundContractIfNeeded(activeContract);
    }

    const renewedContract = await renewContract(agentId);

    if (!renewedContract) {
      return null;
    }

    return fundContractIfNeeded(renewedContract);
  }

  async function getActiveContract(agentId: string) {
    const now = Date.now();

    return db.query.agentExecutionContracts.findFirst({
      where: and(
        eq(agentExecutionContracts.agentId, agentId),
        lte(agentExecutionContracts.startsAt, now),
        gte(agentExecutionContracts.endsAt, now),
      ),
      orderBy: [desc(agentExecutionContracts.endsAt)],
    });
  }

  async function getLatestContract(agentId: string) {
    return db.query.agentExecutionContracts.findFirst({
      where: eq(agentExecutionContracts.agentId, agentId),
      orderBy: [desc(agentExecutionContracts.endsAt)],
    });
  }

  async function listRecentSteps(agentId: string, limit: number) {
    return db.query.agentExecutionSteps.findMany({
      where: eq(agentExecutionSteps.agentId, agentId),
      orderBy: [desc(agentExecutionSteps.createdAt)],
      limit,
    });
  }

  async function getContractSpend(contractId: string) {
    const rows = await db
      .select({
        total: sql<number>`coalesce(sum(${agentExecutionSteps.costUsd}), 0)`,
      })
      .from(agentExecutionSteps)
      .where(eq(agentExecutionSteps.contractId, contractId));

    return rows[0]?.total ?? 0;
  }

  async function getModelPrice(modelKey: string) {
    return db.query.llmModelPrices.findFirst({
      where: eq(llmModelPrices.modelKey, modelKey),
    });
  }

  async function recordAgentStep(input: {
    agentId: string;
    contractId: string;
    modelKey: string;
    kind: 'agent-step' | 'om' | 'ltm';
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    costUsd: number;
  }) {
    await db.insert(agentExecutionSteps).values({
      id: createId(),
      agentId: input.agentId,
      contractId: input.contractId,
      modelKey: input.modelKey,
      kind: input.kind,
      inputTokens: input.inputTokens,
      cachedInputTokens: input.cachedInputTokens,
      outputTokens: input.outputTokens,
      costUsd: input.costUsd,
      createdAt: Date.now(),
    });
  }

  async function renewContract(agentId: string) {
    const latestContract = await getLatestContract(agentId);

    if (!latestContract || !latestContract.autoRenew || latestContract.endsAt > Date.now()) {
      return null;
    }

    const nextContract = {
      id: createId(),
      agentId,
      budgetUsd: latestContract.budgetUsd,
      autoRenew: latestContract.autoRenew,
      fundedAt: null,
      startsAt: latestContract.endsAt,
      endsAt: latestContract.endsAt + WEEK_MS,
      createdAt: Date.now(),
    } as const;

    await db.insert(agentExecutionContracts).values(nextContract);
    return nextContract;
  }

  async function fundContractIfNeeded(contract: typeof agentExecutionContracts.$inferSelect) {
    if (contract.fundedAt) {
      return contract;
    }

    const cashBalanceUsd = await companyCash.getCurrentBalanceUsd();

    if (cashBalanceUsd < contract.budgetUsd) {
      return null;
    }

    const now = Date.now();

    await companyCashOperations.recordCashOut({
      type: 'agent-contract-funding',
      amountUsd: contract.budgetUsd,
      description: `Contract funding for ${contract.agentId}`,
      referenceType: 'agent-execution-contract',
      referenceId: contract.id,
      effectiveAt: now,
    });

    await db
      .update(agentExecutionContracts)
      .set({
        fundedAt: now,
      })
      .where(eq(agentExecutionContracts.id, contract.id));

    return {
      ...contract,
      fundedAt: now,
    };
  }

  return {
    getExecutionState,
    setExecutionState,
    getRunnableContract,
    listRecentSteps,
    getContractSpend,
    getModelPrice,
    recordAgentStep,
  };
}
