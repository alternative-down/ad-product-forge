import { and, desc, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm';
import { forgeDebug } from '@forge-runtime/core';
import { errorMsg } from '../agents/error-formatting';

import type { Database } from '../database/client';
import {
  agents,
  agentExecutionContracts,
  agentExecutionSteps,
  companyCashLedger,
} from '../database/schema';
import { createCompanyCashLedger } from '../finance/company-cash-ledger';
import {
  COMPANY_CASH_DIRECTIONS,
  COMPANY_CASH_STATUSES,
  type CompanyCashDirection,
  type CompanyCashStatus,
} from '../finance/company-cash-enums';

type ListCompanyCashMovementsInput = {
  direction?: CompanyCashDirection;
  status?: CompanyCashStatus;
  type?: string;
  periodStart?: number;
  periodEnd?: number;
  limit?: number;
  offset?: number;
};

export type MicroErpReadModel = ReturnType<typeof createMicroErpReadModel>;

export function createMicroErpReadModel(db: Database) {
  const companyCash = createCompanyCashLedger(db);

  async function getCompanyCashBalance() {
    const balanceUsd: number = await companyCash.getCurrentBalanceUsd();
    return { balanceUsd };
  }

  async function listCompanyCashMovements(input: ListCompanyCashMovementsInput = {}) {
    const limit = input.limit ?? 20;
    const offset = input.offset ?? 0;
    const conditions = [];
    if (input.direction) {
      conditions.push(eq(companyCashLedger.direction, input.direction));
    }

    if (input.status !== null && input.status !== undefined) {
      conditions.push(eq(companyCashLedger.status, input.status));
    }

    if (input.type !== null && input.type !== undefined) {
      conditions.push(eq(companyCashLedger.type, input.type));
    }

    if (input.periodStart !== undefined) {
      conditions.push(sql`${movementTimestamp()} >= ${input.periodStart}`);
    }

    if (input.periodEnd !== undefined) {
      conditions.push(sql`${movementTimestamp()} <= ${input.periodEnd}`);
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const rows = await db.query.companyCashLedger.findMany({
      where,
      orderBy: [desc(companyCashLedger.createdAt)],
      limit,
      offset,
    });
    const countRows = await db
      .select({
        total: sql<number>`count(*)`,
      })
      .from(companyCashLedger)
      .where(where)
      .all();

    let summary;
    let summaryError: { message: string } | undefined;
    try {
      summary = await getCompanyCashSummary({
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
      });
    } catch (err) {
      // L#NN-50 #19 v3: distinguish error from no-data (summaryError undefined = no error)
      const message = errorMsg(err);
      forgeDebug({
        scope: 'micro-erp-read-model',
        level: 'error',
        message: 'listCompanyCashMovements: getCompanyCashSummary failed',
        context: { error: message },
      });
      summaryError = { message };
      summary = null;
    }

    return {
      items: rows.map((row) => ({
        ...row,
        direction: row.direction as CompanyCashDirection,
        description: row.description ?? undefined,
        dueAt: row.dueAt ?? undefined,
        effectiveAt: row.effectiveAt ?? undefined,
      })),
      total: countRows[0]?.total ?? 0,
      summary,
      summaryError,
    };
  }

  async function getCompanyCashSummary(
    input: {
      periodStart?: number;
      periodEnd?: number;
    } = {},
  ) {
    const now = Date.now();
    const periodStart = input.periodStart ?? startOfCurrentMonth(now);
    const periodEnd = input.periodEnd ?? now;
    const postedTotals = await db
      .select({
        totalInUsd: sql<number>`coalesce(sum(case when ${companyCashLedger.direction} = ${COMPANY_CASH_DIRECTIONS[0]} then ${companyCashLedger.amountUsd} else 0 end), 0)`,
        totalOutUsd: sql<number>`coalesce(sum(case when ${companyCashLedger.direction} = ${COMPANY_CASH_DIRECTIONS[1]} then ${companyCashLedger.amountUsd} else 0 end), 0)`,
      })
      .from(companyCashLedger)
      .where(
        and(
          eq(companyCashLedger.status, COMPANY_CASH_STATUSES[1]),
          gte(companyCashLedger.effectiveAt, periodStart),
          lte(companyCashLedger.effectiveAt, periodEnd),
        ),
      )
      .all();
    const scheduledTotals = await db
      .select({
        scheduledInUsd: sql<number>`coalesce(sum(case when ${companyCashLedger.direction} = ${COMPANY_CASH_DIRECTIONS[0]} then ${companyCashLedger.amountUsd} else 0 end), 0)`,
        scheduledOutUsd: sql<number>`coalesce(sum(case when ${companyCashLedger.direction} = ${COMPANY_CASH_DIRECTIONS[1]} then ${companyCashLedger.amountUsd} else 0 end), 0)`,
      })
      .from(companyCashLedger)
      .where(
        and(
          ne(companyCashLedger.status, COMPANY_CASH_STATUSES[2]),
          eq(companyCashLedger.status, COMPANY_CASH_STATUSES[0]),
          gte(companyCashLedger.dueAt, Math.max(periodStart, now)),
          lte(companyCashLedger.dueAt, periodEnd),
        ),
      )
      .all();
    const totalInUsd = postedTotals[0]?.totalInUsd ?? 0;
    const totalOutUsd = postedTotals[0]?.totalOutUsd ?? 0;
    const scheduledInUsd = scheduledTotals[0]?.scheduledInUsd ?? 0;
    const scheduledOutUsd = scheduledTotals[0]?.scheduledOutUsd ?? 0;

    const balanceUsd = await companyCash.getCurrentBalanceUsd();

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
    const rows = await db
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
        and(lte(agentExecutionContracts.startsAt, now), gte(agentExecutionContracts.endsAt, now)),
      )
      .orderBy(desc(agentExecutionContracts.endsAt))
      .all();
    const metricsByContractId = await getActiveContractMetrics(rows, now);

    return {
      items: rows.map((row) => ({
        ...row,
        autoRenew: Boolean(row.autoRenew),
        ...metricsByContractId.get(row.contractId),
      })),
    };
  }

  async function getActiveInternalAgentContract(agentId: string) {
    const now = Date.now();
    const row = await db
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
      .limit(1)
      .all();

    const contract = row[0];
    if (contract === null || contract === undefined) {
      return null;
    }
    const metricsByContractId = await getActiveContractMetrics([contract], now);

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

    const [spendRows, stepRows] = await Promise.all([
      db
        .select({
          contractId: agentExecutionSteps.contractId,
          total: sql<number>`coalesce(sum(${agentExecutionSteps.costUsd}), 0)`,
        })
        .from(agentExecutionSteps)
        .where(inArray(agentExecutionSteps.contractId, contractIds))
        .groupBy(agentExecutionSteps.contractId)
        .all(),
      db.query.agentExecutionSteps.findMany({
        where: inArray(agentExecutionSteps.contractId, contractIds),
        orderBy: [desc(agentExecutionSteps.createdAt)],
      }),
    ]);

    const spentUsdByContractId = new Map(spendRows.map((row) => [row.contractId, row.total]));
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
function movementTimestamp() {
  return sql`coalesce(${companyCashLedger.effectiveAt}, ${companyCashLedger.createdAt})`;
}

function startOfCurrentMonth(timestamp: number): number {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
}
