import { and, desc, eq, lte, gte, sql } from 'drizzle-orm';
import { createId } from '../utils/id';
import { WEEK_MS } from '../shared/constants';

import type { Database } from '../database/index';
import { agents, agentExecutionContracts, agentExecutionSteps, llmModelPrices, llmProfiles } from '../database/schema';
import { createCompanyCashLedger } from '../finance/company-cash-ledger';
import { createCompanyCashOperations } from '../finance/company-cash-operations';


export function createAgentContractStore(db: Database) {
  const companyCash = createCompanyCashLedger(db);
  const companyCashOperations = createCompanyCashOperations(db);

  async function getExecutionState(agentId: string): Promise<'idle' | 'running' | 'absent'> {
    const agent = await db.query.agents.findFirst({
      where: eq(agents.id, agentId),
    });

    return (agent?.executionState as 'idle' | 'running' | 'absent' | undefined) ?? 'idle';
  }

  async function setExecutionState(agentId: string, executionState: 'idle' | 'running' | 'absent') {
    await db
      .update(agents)
      .set({
        executionState,
        lastExecutionError: null,
        lastExecutionErrorAt: null,
        updatedAt: Date.now(),
      })
      .where(eq(agents.id, agentId));
  }

  async function setExecutionAbsent(agentId: string, error: string) {
    await db
      .update(agents)
      .set({
        executionState: 'absent',
        lastExecutionError: error,
        lastExecutionErrorAt: Date.now(),
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

  async function getUsagePricing(input: {
    pricingModelKey: string;
    profileId: string;
  }) {
    const modelPrice = await db.query.llmModelPrices.findFirst({
      where: eq(llmModelPrices.modelKey, input.pricingModelKey),
    });

    const profile = await db.query.llmProfiles.findFirst({
      where: eq(llmProfiles.id, input.profileId),
    });

    if (!profile) {
      throw new Error(`LLM profile not found for pricing: ${input.profileId}`);
    }

    return {
      modelPrice,
      contractCostMultiplier: profile.contractCostMultiplier,
    };
  }

  async function recordAgentStep(input: {
    agentId: string;
    contractId: string;
    llmProfileId: string;
    modelKey: string;
    kind: 'agent-step' | 'om' | 'ltm';
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    inputPerMillionUsd: number;
    inputCachePerMillionUsd: number;
    outputPerMillionUsd: number;
    contractCostMultiplier: number;
    costUsd: number;
  }) {
    const id = createId();
    const createdAt = Date.now();

    await db.insert(agentExecutionSteps).values({
      id,
      agentId: input.agentId,
      contractId: input.contractId,
      llmProfileId: input.llmProfileId,
      modelKey: input.modelKey,
      kind: input.kind,
      inputTokens: input.inputTokens,
      cachedInputTokens: input.cachedInputTokens,
      outputTokens: input.outputTokens,
      inputPerMillionUsd: input.inputPerMillionUsd,
      inputCachePerMillionUsd: input.inputCachePerMillionUsd,
      outputPerMillionUsd: input.outputPerMillionUsd,
      contractCostMultiplier: input.contractCostMultiplier,
      costUsd: input.costUsd,
      createdAt,
    });

    return {
      stepId: id,
      createdAt,
    };
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

  async function refundActiveContractBalance(agentId: string) {
    const activeContract = await getActiveContract(agentId);

    if (!activeContract || !activeContract.fundedAt) {
      return null;
    }

    const spentUsd = await getContractSpend(activeContract.id);
    const refundableUsd = Math.max(activeContract.budgetUsd - spentUsd, 0);

    if (refundableUsd <= 0) {
      return {
        contractId: activeContract.id,
        refundedUsd: 0,
      };
    }

    await companyCashOperations.recordCashIn({
      type: 'agent-contract-termination-refund',
      amountUsd: refundableUsd,
      description: `Contract refund for terminated agent ${agentId}`,
      referenceType: 'agent-execution-contract',
      referenceId: activeContract.id,
      effectiveAt: Date.now(),
    });

    return {
      contractId: activeContract.id,
      refundedUsd: refundableUsd,
    };
  }

  return {
    getExecutionState,
    setExecutionState,
    setExecutionAbsent,
    getRunnableContract,
    listRecentSteps,
    getContractSpend,
    getUsagePricing,
    recordAgentStep,
    refundActiveContractBalance,
  };

}
