import { and, desc, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm';
import { forgeDebug } from '@forge-runtime/core';


import type {Database} from '../database/schema';
import { agents, agentExecutionContracts, agentExecutionSteps, companyCashLedger } from '../database/schema';
import { createCompanyCashLedger } from '../finance/company-cash-ledger';

const IN = 'in';
const OUT = 'out';
const POSTED = 'posted';
const PLANNED = 'planned';
const CANCELED = 'canceled';

export type ListCompanyCashMovementsInput = {
  direction?: 'in' | 'out';
  status?: 'planned' | 'posted' | 'canceled';
  type?: string;
  periodStart?: number;
  periodEnd?: number;
  limit?: number;
  offset?: number;
};

export function createMicroErpReadModel(db: Database) {
  const companyCash = createCompanyCashLedger(db);

  async function getCompanyCashBalance() {
    let balanceUsd: number;
      balanceUsd = await companyCash.getCurrentBalanceUsd();
    return { balanceUsd };
  }

  async function listCompanyCashMovements(input: ListCompanyCashMovementsInput = {}) {
    const limit = input.limit ?? 20;
    const offset = input.offset ?? 0;
    const conditions = [];
    if (input.direction) {
      conditions.push(eq(companyCashLedger.direction, input.direction));
    }

    if (input.status) {
      conditions.push(eq(companyCashLedger.status, input.status));
    }

    if (input.type) {
      conditions.push(eq(companyCashLedger.type, input.type));
    }

    if (input.periodStart !== undefined) {
      conditions.push(sql`${movementTimestamp()} >= ${input.periodStart}`);
    }

    if (input.periodEnd !== undefined) {
      conditions.push(sql`${movementTimestamp()} <= ${input.periodEnd}`);
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    let rows;
      rows = await db.query.companyCashLedger.findMany({
        where,
        orderBy: [desc(companyCashLedger.createdAt)],
        limit,
        offset,
      });
    let countRows;
      countRows = await db
        .select({
          total: sql<number>`count(*)`,
        })
        .from(companyCashLedger)
        .where(where);

    let summary;
    try {
      summary = await getCompanyCashSummary({
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
      });
    } catch (err) {
      // Non-fatal: log but continue without summary
      forgeDebug({
        scope: 'micro-erp-read-model',
        level: 'error',
        message: `listCompanyCashMovements: getCompanyCashSummary failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      summary = null;
    }

    return {
      items: rows.map((row: object) => ({
        ...row,
        direction: row.direction as 'in' | 'out',
        description: row.description ?? undefined,
        dueAt: row.dueAt ?? undefined,
        effectiveAt: row.effectiveAt ?? undefined,
      })),
      total: countRows[0]?.total ?? 0,
      summary,
    };
  }

  async function getCompanyCashSummary(input: {
    periodStart?: number;
    periodEnd?: number;
  } = {}) {
    const now = Date.now();
    const periodStart = input.periodStart ?? startOfCurrentMonth(now);
    const periodEnd = input.periodEnd ?? now;
    let postedTotals;
      postedTotals = await db
        .select({
          totalInUsd: sql<number>`coalesce(sum(case when ${companyCashLedger.direction} = ${IN} then ${companyCashLedger.amountUsd} else 0 end), 0)`,
          totalOutUsd: sql<number>`coalesce(sum(case when ${companyCashLedger.direction} = ${OUT} then ${companyCashLedger.amountUsd} else 0 end), 0)`,
        })
        .from(companyCashLedger)
        .where(
          and(
            eq(companyCashLedger.status, POSTED),
            gte(companyCashLedger.effectiveAt, periodStart),
            lte(companyCashLedger.effectiveAt, periodEnd),
          ),
        );
    let scheduledTotals;
      scheduledTotals = await db
        .select({
          scheduledInUsd: sql<number>`coalesce(sum(case when ${companyCashLedger.direction} = ${IN} then ${companyCashLedger.amountUsd} else 0 end), 0)`,
          scheduledOutUsd: sql<number>`coalesce(sum(case when ${companyCashLedger.direction} = ${OUT} then ${companyCashLedger.amountUsd} else 0 end), 0)`,
        })
        .from(companyCashLedger)
        .where(
          and(
            ne(companyCashLedger.status, CANCELED),
            eq(companyCashLedger.status, PLANNED),
            gte(companyCashLedger.dueAt, Math.max(periodStart, now)),
            lte(companyCashLedger.dueAt, periodEnd),
          ),
        );
    const totalInUsd = postedTotals[0]?.totalInUsd ?? 0;
    const totalOutUsd = postedTotals[0]?.totalOutUsd ?? 0;
    const scheduledInUsd = scheduledTotals[0]?.scheduledInUsd ?? 0;
    const scheduledOutUsd = scheduledTotals[0]?.scheduledOutUsd ?? 0;

    let balanceUsd;
      balanceUsd = await companyCash.getCurrentBalanceUsd();

    return {
      periodStart,
      periodEnd,
      totalInUsd,
      totalOutUsd,
      netUsd: totalInUsd - totalOutUsd,
      balanceUsd,
      scheduledInUsd,
      scheduledOutUsd,
    };
  }

  async function listActiveInternalAgentContracts() {
    const now = Date.now();
    let rows;
      rows = await db
        .select({
          contractId: agentExecutionContracts.id,
          agentId: agentExecutionContracts.agentId,
          agentName: agents.name,
          startsAt: agentExecutionContracts.startsAt,
          endsAt: agentExecutionContracts.endsAt,
          weeklyValueUsd: agentExecutionContracts.budgetUsd,
          autoRenew: agentExecutionContracts.autoRenew,
        })
        .from(agentExecutionContracts)
        .innerJoin(agents, eq(agents.id, agentExecutionContracts.agentId))
        .where(
          and(
            lte(agentExecutionContracts.startsAt, now),
            gte(agentExecutionContracts.endsAt, now),
          ),
        )
        .orderBy(desc(agentExecutionContracts.endsAt)).all();
    let metricsByContractId;
      metricsByContractId = await getActiveContractMetrics(rows, now);

    return {
      items: rows.map((row: object) => ({
        ...row,
        autoRenew: Boolean(row.autoRenew),
        ...metricsByContractId.get(row.contractId),
      })),
    };
  }

  async function getActiveInternalAgentContract(agentId: string) {
    const now = Date.now();
    let row;
      row = await db
        .select({
          contractId: agentExecutionContracts.id,
          agentId: agentExecutionContracts.agentId,
          agentName: agents.name,
          startsAt: agentExecutionContracts.startsAt,
          endsAt: agentExecutionContracts.endsAt,
          weeklyValueUsd: agentExecutionContracts.budgetUsd,
          autoRenew: agentExecutionContracts.autoRenew,
        })
        .from(agentExecutionContracts)
        .innerJoin(agents, eq(agents.id, agentExecutionContracts.agentId))
        .where(
          and(
            eq(agentExecutionContracts.agentId, agentId),
            lte(agentExecutionContracts.startsAt, now),
            gte(agentExecutionContracts.endsAt, now),
          ),
        )
        .orderBy(desc(agentExecutionContracts.endsAt))
        .limit(1);

    const contract = row[0];
    if (!contract) {
      return null;
    }
    let metricsByContractId;
      metricsByContractId = await getActiveContractMetrics([contract], now);

    return {
      ...contract,
      autoRenew: Boolean(contract.autoRenew),
      ...metricsByContractId.get(contract.contractId),
    };
  }

  async function getActiveContractMetrics(
    contracts: Array<{
      contractId: string;
      weeklyValueUsd: number;
      endsAt: number;
    }>,
    now: number,
  ) {
    if (contracts.length === 0) {
      return new Map();
    }
    const contractIds = contracts.map((contract) => contract.contractId);
    const contractBudgetById = new Map(
      contracts.map((contract) => [contract.contractId, contract.weeklyValueUsd]),
    );
    const contractEndsAtById = new Map(
      contracts.map((contract) => [contract.contractId, contract.endsAt]),
    );

    let spendRows: Array<{ contractId: string; total: number }>;
    let stepRows;
      [spendRows, stepRows] = await Promise.all([
        db
          .select({
            contractId: agentExecutionSteps.contractId,
            total: sql<number>`coalesce(sum(${agentExecutionSteps.costUsd}), 0)`,
          })
          .from(agentExecutionSteps)
          .where(inArray(agentExecutionSteps.contractId, contractIds))
          .groupBy(agentExecutionSteps.contractId).all(),
        db.query.agentExecutionSteps.findMany({
          where: inArray(agentExecutionSteps.contractId, contractIds),
          orderBy: [desc(agentExecutionSteps.createdAt)],
        }),
      ]);

    const spentUsdByContractId = new Map(
      spendRows.map((row) => [row.contractId, row.total]),
    );
    const recentStepsByContractId = new Map<string, typeof stepRows>();

    for (const step of stepRows) {
      const recentSteps = recentStepsByContractId.get(step.contractId) ?? [];
      if (recentSteps.length >= 10) {
        continue;
      }

      recentSteps.push(step);
      recentStepsByContractId.set(step.contractId, recentSteps);
    }

    return new Map(
      contracts.map((contract) => {
        const contractId = contract.contractId;
        const spentUsd = spentUsdByContractId.get(contractId) ?? 0;
        const recentSteps = recentStepsByContractId.get(contractId) ?? [];
        const budgetUsd = contractBudgetById.get(contractId) ?? 0;
        const endsAt = contractEndsAtById.get(contractId) ?? now;
        const budgetRemainingUsd = Math.max(0, budgetUsd - spentUsd);
        const budgetUsedPct = budgetUsd > 0 ? (spentUsd / budgetUsd) * 100 : 0;

        return [
          contractId,
          {
            spentUsd,
            budgetRemainingUsd,
            budgetUsedPct,
            recentSteps,
            daysUntilEnd: Math.ceil((endsAt - now) / (1000 * 60 * 60 * 24)),
          },
        ];
      }),
    );
  }

  return {
    getCompanyCashBalance,
    listCompanyCashMovements,
    getCompanyCashSummary,
    listActiveInternalAgentContracts,
    getActiveInternalAgentContract,
    getActiveContractMetrics,
  };
}

/**
 * Returns the timestamp column to use for period filtering.
 * Uses effectiveAt when available, otherwise falls back to createdAt.
 */
export type MicroErpReadModel = ReturnType<typeof createMicroErpReadModel>;

function movementTimestamp() {
  return sql`coalesce(${companyCashLedger.effectiveAt}, ${companyCashLedger.createdAt})`;
}

function startOfCurrentMonth(timestamp: number): number {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
}