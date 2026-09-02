import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { forgeDebug } from '@forge-runtime/core';
import { createId } from '../utils/id';
import { WEEK_MS } from '../shared/constants';
import { createTimeProvider, type TimeProvider } from '../utils/time';

import type { Database } from '../database/client';
import {
  agents,
  agentExecutionContracts,
  agentExecutionSteps,
  llmModelPrices,
  llmProfiles,
  type AgentExecutionContract,
  type NewAgentExecutionContract,
} from '../database/schema';
import { createCompanyCashLedger } from '../finance/company-cash-ledger';
import { createCompanyCashOperations } from '../finance/company-cash-operations';
import { findOrThrow } from '../database/find-or-throw';
import { withDbErrorLogging } from '../database/error-logging';


/**
 * Creates an agent contract store.
 *
 * @param db - Database instance
 * @param timeProvider - Optional time source for testability. Defaults to Date.now.
 */
export type AgentContractStore = ReturnType<typeof createAgentContractStore>;

export function createAgentContractStore(db: Database, timeProvider?: TimeProvider) {
  const time = timeProvider ?? createTimeProvider();
  const companyCash = createCompanyCashLedger(db);
  const companyCashOperations = createCompanyCashOperations(db);

  const VALID_STATES = ['idle', 'running', 'absent'] as const;
  type ExecutionState = (typeof VALID_STATES)[number];
  function toExecutionState(raw: string | null | undefined): 'idle' | 'running' | 'absent' {
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (raw && VALID_STATES.includes(raw as ExecutionState)) {
      return raw as 'idle' | 'running' | 'absent';
    }
    return 'idle';
  }

  async function getExecutionState(agentId: string): Promise<'idle' | 'running' | 'absent'> {
    return await withDbErrorLogging({
      scope: 'agent-contract-store',
      op: 'getExecutionState',
      verb: 'read',
      context: { agentId },
      fn: async () => {
        const agent = await db.query.agents.findFirst({
          where: eq(agents.id, agentId),
        });
        return toExecutionState(agent?.executionState);
      },
    });
  }

  async function setExecutionState(agentId: string, executionState: 'idle' | 'running' | 'absent') {
    await withDbErrorLogging({
      scope: 'agent-contract-store',
      op: 'setExecutionState',
      verb: 'write',
      context: { agentId, executionState },
      fn: () =>
        db
          .update(agents)
          .set({
            executionState,
            lastExecutionError: null,
            lastExecutionErrorAt: null,
            updatedAt: time.now(),
          })
          .where(eq(agents.id, agentId)),
    });
  }

  async function setExecutionAbsent(agentId: string, error: string) {
    await withDbErrorLogging({
      scope: 'agent-contract-store',
      op: 'setExecutionAbsent',
      verb: 'write',
      context: { agentId },
      fn: () =>
        db
          .update(agents)
          .set({
            executionState: 'absent',
            lastExecutionError: error,
            lastExecutionErrorAt: time.now(),
            updatedAt: time.now(),
          })
          .where(eq(agents.id, agentId)),
    });
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
    const newContract: NewAgentExecutionContract = {
      id: createId(),
      agentId,
      budgetUsd: latestContract.budgetUsd,
      autoRenew: latestContract.autoRenew,
      fundedAt: null,
      startsAt: latestContract.endsAt,
      endsAt: latestContract.endsAt + WEEK_MS,
      createdAt: now,
      updatedAt: now,
    };

    const cashBalanceUsd = await companyCash.getCurrentBalanceUsd();
    if (cashBalanceUsd < newContract.budgetUsd) {
      return null;
    }

    // Wrap insert + funding in same transaction — if funding fails, contract insert rolls back
    await db.transaction(async (tx) => {
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
        .set({ fundedAt: now, updatedAt: now })
        .where(eq(agentExecutionContracts.id, newContract.id));
    });

    return { ...newContract, fundedAt: now };
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
    return await withDbErrorLogging({
      scope: 'agent-contract-store',
      op: 'getLatestContract',
      verb: 'read',
      context: { agentId },
      fn: () =>
        db.query.agentExecutionContracts.findFirst({
          where: eq(agentExecutionContracts.agentId, agentId),
          orderBy: [desc(agentExecutionContracts.endsAt)],
        }),
    });
  }

  async function listRecentSteps(agentId: string, limit: number) {
    return await withDbErrorLogging({
      scope: 'agent-contract-store',
      op: 'listRecentSteps',
      verb: 'read',
      context: { agentId, limit },
      fn: () =>
        db.query.agentExecutionSteps.findMany({
          where: eq(agentExecutionSteps.agentId, agentId),
          orderBy: [desc(agentExecutionSteps.createdAt)],
          limit,
        }),
    });
  }

  async function getUsagePricing(input: { pricingModelKey: string; profileId: string }) {
    const priceRow = await withDbErrorLogging({
      scope: 'agent-contract-store',
      op: 'getUsagePricing',
      verb: 'read',
      context: { pricingModelKey: input.pricingModelKey },
      fn: () =>
        db.query.llmModelPrices.findFirst({
          where: eq(llmModelPrices.modelKey, input.pricingModelKey),
        }),
    });

    if (!priceRow) {
      forgeDebug({
        scope: 'agent-contract-store',
        level: 'warn',
        message: 'getUsagePricing: model price not found',
        context: { pricingModelKey: input.pricingModelKey },
      });
      return { modelPrice: null, contractCostMultiplier: 1 };
    }

    const profile = await findOrThrow(
      db.query.llmProfiles,
      {
        scope: 'agent-contract-store',
        entity: 'LLM profile',
        op: 'getUsagePricing',
        idValue: input.profileId,
        idField: 'profileId',
      },
      { where: eq(llmProfiles.id, input.profileId) },
    );

    return {
      modelPrice: priceRow,
      contractCostMultiplier: profile.contractCostMultiplier,
    };
  }

  async function getContractSpend(contractId: string) {
    const rows: { total: number }[] = await db
      .select({
        total: sql<number>`coalesce(sum(${agentExecutionSteps.costUsd}), 0)`,
      })
      .from(agentExecutionSteps)
      .where(eq(agentExecutionSteps.contractId, contractId))
      .all();

    const row = rows[0];
    return row?.total ?? 0;
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

    await withDbErrorLogging({
      scope: 'agent-contract-store',
      op: 'recordAgentStep',
      verb: 'write',
      context: { agentId: input.agentId, contractId: input.contractId },
      fn: () =>
        db.transaction(async (tx) => {
          await tx.insert(agentExecutionSteps).values({
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
        }),
    });

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
    const nextContract: NewAgentExecutionContract = {
      id: createId(),
      agentId,
      budgetUsd: latestContract.budgetUsd,
      autoRenew: latestContract.autoRenew,
      fundedAt: null,
      startsAt: latestContract.endsAt,
      endsAt: latestContract.endsAt + WEEK_MS,
      createdAt: now,
      updatedAt: now,
    };

    await withDbErrorLogging({
      scope: 'agent-contract-store',
      op: 'renewContract',
      verb: 'write',
      context: { agentId },
      fn: () =>
        db.transaction(async (tx) => {
          await tx.insert(agentExecutionContracts).values(nextContract);
        }),
    });
    return nextContract;
  }

  async function fundContractIfNeeded(contract: AgentExecutionContract) {
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (contract.fundedAt) {
      return contract;
    }

    const cashBalanceUsd = await companyCash.getCurrentBalanceUsd();
    if (cashBalanceUsd < contract.budgetUsd) {
      return null;
    }
    const now = time.now();
    await withDbErrorLogging({
      scope: 'agent-contract-store',
      op: 'fundContractIfNeeded',
      verb: 'write',
      context: { agentId: contract.agentId, contractId: contract.id },
      fn: () =>
        db.transaction(async (tx) => {
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
            .set({ fundedAt: now, updatedAt: now })
            .where(eq(agentExecutionContracts.id, contract.id));
        }),
    });
    return { ...contract, fundedAt: now };
  }

  async function refundActiveContractBalance(agentId: string) {
    const activeContract = await getActiveContract(agentId);

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
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
    await withDbErrorLogging({
      scope: 'agent-contract-store',
      op: 'refundActiveContractBalance',
      verb: 'write',
      context: { agentId },
      fn: () =>
        db.transaction(async (tx) => {
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
        }),
    });

    return {
      contractId: activeContract.id,
      refundedUsd: refundableUsd,
    };
  }

  return {
    getExecutionState,
    setExecutionState,
    getActiveContract,
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
