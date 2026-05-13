import { and, desc, eq, lte, gte, sql } from 'drizzle-orm';
import { forgeDebug } from '@forge-runtime/core';
import { createId } from '../utils/id';
import { WEEK_MS } from '../shared/constants';
import { createTimeProvider, type TimeProvider } from '../utils/time';


import type {Database} from '../database/schema';
import { agents, agentExecutionContracts, agentExecutionSteps, llmModelPrices, llmProfiles, type AgentExecutionContract } from '../database/schema';
import { createCompanyCashLedger } from '../finance/company-cash-ledger';
import { createCompanyCashOperations } from '../finance/company-cash-operations';

export interface CreateAgentContractStoreOptions {
  db: Database;
  timeProvider?: TimeProvider;
}

/**
 * Creates an agent contract store.
 *
 * @param db - Database instance
 * @param timeProvider - Optional time source for testability. Defaults to Date.now.
 */
export function createAgentContractStore(
  db: Database,
  timeProvider?: TimeProvider,
) {
  const time = timeProvider ?? createTimeProvider();
  const companyCash = createCompanyCashLedger(db);
  const companyCashOperations = createCompanyCashOperations(db);
  const logContractError = (
    context: string,
    runtimeId: string | undefined,
    error: unknown,
  ) => {
    forgeDebug({
      scope: 'agent-contract-store',
      level: 'error',
      runtimeId,
      message: context + ' failed: ' + (error instanceof Error ? error.message : String(error)),
    });
  };


  const VALID_STATES = ['idle', 'running', 'absent'] as const;
  type ExecutionState = typeof VALID_STATES[number];
  function toExecutionState(raw: string | null | undefined): 'idle' | 'running' | 'absent' {
    if (raw && VALID_STATES.includes(raw as ExecutionState)) {
      return raw as 'idle' | 'running' | 'absent';
    }
    return 'idle';
  }

  async function getExecutionState(agentId: string): Promise<'idle' | 'running' | 'absent'> {
    try {
      const agent = await db.query.agents.findFirst({
        where: eq(agents.id, agentId),
      });
      return toExecutionState(agent?.executionState);
    } catch (error) {
      logContractError('getExecutionState', agentId, error);
      throw error;
    }
  }

  async function setExecutionState(agentId: string, executionState: 'idle' | 'running' | 'absent') {
    try {
      await db
        .update(agents)
        .set({
          executionState,
          lastExecutionError: null,
          lastExecutionErrorAt: null,
          updatedAt: time.now(),
        })
        .where(eq(agents.id, agentId));
    } catch (error) {
      logContractError('setExecutionState(' + executionState + ')', agentId, error);
      throw error;
    }
  }

  async function setExecutionAbsent(agentId: string, error: string) {
    try {
      await db
        .update(agents)
        .set({
          executionState: 'absent',
          lastExecutionError: error,
          lastExecutionErrorAt: time.now(),
          updatedAt: time.now(),
        })
        .where(eq(agents.id, agentId));
    } catch (err) {
      logContractError('setExecutionAbsent', agentId, err);
      throw err;
    }
  }

  async function getRunnableContract(agentId: string) {
    const activeContract = await getActiveContract(agentId);

    if (activeContract) {
      return await fundContractIfNeeded(activeContract);
    }

    const latestContract = await getLatestContract(agentId);

    if (!latestContract || !latestContract.autoRenew || latestContract.endsAt > time.now()) {
      return null;
    }

    const now = time.now();
    const newContract = {
      id: createId(),
      agentId,
      budgetUsd: latestContract.budgetUsd,
      autoRenew: latestContract.autoRenew,
      fundedAt: null,
      startsAt: latestContract.endsAt,
      endsAt: latestContract.endsAt + WEEK_MS,
      createdAt: now,
    } as const;

    try {
      const cashBalanceUsd = await companyCash.getCurrentBalanceUsd();
      if (cashBalanceUsd < newContract.budgetUsd) {
        return null;
      }

      // Wrap insert + funding in same transaction — if funding fails, contract insert rolls back
      await db.transaction(async (tx: import("drizzle-orm").sql.SQL) => {
        await tx.insert(agentExecutionContracts).values(newContract);

        await companyCashOperations.recordCashOut(
          {
            type: 'agent-contract-funding',
            amountUsd: newContract.budgetUsd,
            description: `Contract funding for ${agentId}`,
            referenceType: 'agent-execution-contract',
            referenceId: newContract.id,
            effectiveAt: now,
          },
          tx,
        );

        await tx
          .update(agentExecutionContracts)
          .set({ fundedAt: now })
          .where(eq(agentExecutionContracts.id, newContract.id));
      });

      return newContract;
    } catch (err) {
      logContractError('getRunnableContract renewal/funding', agentId, err);
      throw err;
    }
  }

  async function getActiveContract(agentId: string) {
    const now = time.now();
    return await db.query.agentExecutionContracts.findFirst({
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
      forgeDebug({ scope: 'agent-contract-store', level: 'warn', message: 'getUsagePricing: LLM profile not found', context: { profileId: input.profileId } });
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
    const createdAt = time.now();

    try {
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
        updatedAt: createdAt,
      });
    } catch (error) {
      logContractError('recordAgentStep', input.agentId, error);
      throw error;
    }

    return {
      stepId: id,
      createdAt,
    };
  }

  async function renewContract(agentId: string) {
    const latestContract = await getLatestContract(agentId);

    if (!latestContract || !latestContract.autoRenew || latestContract.endsAt > time.now()) {
      return null;
    }

    const now = time.now();
    const nextContract = {
      id: createId(),
      agentId,
      budgetUsd: latestContract.budgetUsd,
      autoRenew: latestContract.autoRenew,
      fundedAt: null,
      startsAt: latestContract.endsAt,
      endsAt: latestContract.endsAt + WEEK_MS,
      createdAt: now,
    } as const;

    try {
      await db.transaction(async (tx: import("drizzle-orm").sql.SQL) => {
        await tx.insert(agentExecutionContracts).values(nextContract);
      });
    } catch (err) {
      logContractError('renewContract', agentId, err);
      throw err;
    }
    return nextContract;
  }

  async function fundContractIfNeeded(contract: AgentExecutionContract) {
    if (contract.fundedAt) {
      return contract;
    }

    try {
      const cashBalanceUsd = await companyCash.getCurrentBalanceUsd();
      if (cashBalanceUsd < contract.budgetUsd) {
        return null;
      }
      const now = time.now();
      await db.transaction(async (tx: import("drizzle-orm").sql.SQL) => {
        await companyCashOperations.recordCashOut(
          {
            type: 'agent-contract-funding',
            amountUsd: contract.budgetUsd,
            description: `Contract funding for ${contract.agentId}`,
            referenceType: 'agent-execution-contract',
            referenceId: contract.id,
            effectiveAt: now,
          },
          tx,
        );

        await tx
          .update(agentExecutionContracts)
          .set({ fundedAt: now })
          .where(eq(agentExecutionContracts.id, contract.id));
      });
      return { ...contract, fundedAt: now };
    } catch (error) {
      logContractError('fundContractIfNeeded', contract.agentId, error);
      throw error;
    }
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

    const now = time.now();
    try {
      await db.transaction(async (tx: import("drizzle-orm").sql.SQL) => {
        await companyCashOperations.recordCashIn(
          {
            type: 'agent-contract-termination-refund',
            amountUsd: refundableUsd,
            description: `Contract refund for terminated agent ${agentId}`,
            referenceType: 'agent-execution-contract',
            referenceId: activeContract.id,
            effectiveAt: now,
          },
          tx,
        );
      });
    } catch (err) {
      logContractError('refundActiveContractBalance', agentId, err);
      throw err;
    }

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
    renewContract,
    fundContractIfNeeded,
    refundActiveContractBalance,
  };
}