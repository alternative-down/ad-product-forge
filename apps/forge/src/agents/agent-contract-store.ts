import { and, desc, eq, lte, gte, sql } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

import type { Database } from '../database/index.js';
import { agents, agentExecutionContracts, agentExecutionSteps, llmModelPrices } from '../database/schema.js';

export function createAgentContractStore(db: Database) {
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

  return {
    getExecutionState,
    setExecutionState,
    getActiveContract,
    listRecentSteps,
    getContractSpend,
    getModelPrice,
    recordAgentStep,
  };
}
