import { and, desc, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm';

import type { Database } from '../database/index';
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
    return {
      balanceUsd: await companyCash.getCurrentBalanceUsd(),
    };
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
      .where(where);

    return {
      items: rows.map((row) => ({
        ...row,
        direction: row.direction as 'in' | 'out',
        description: row.description ?? undefined,
        dueAt: row.dueAt ?? undefined,
        effectiveAt: row.effectiveAt ?? undefined,
      })),
      total: countRows[0]?.total ?? 0,
      summary: await getCompanyCashSummary({
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
      }),
    };
  }

  async function getCompanyCashSummary(input: {
    periodStart?: number;
    periodEnd?: number;
  } = {}) {
    const now = Date.now();
    const periodStart = input.periodStart ?? startOfCurrentMonth(now);
    const periodEnd = input.periodEnd ?? now;
    const postedTotals = await db
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
    const scheduledTotals = await db
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

    return {
      periodStart,
      periodEnd,
      totalInUsd,
      totalOutUsd,
      netUsd: totalInUsd - totalOutUsd,
      balanceUsd: await companyCash.getCurrentBalanceUsd(),
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
        and(
          lte(agentExecutionContracts.startsAt, now),
          gte(agentExecutionContracts.endsAt, now),
        ),
      )
      .orderBy(desc(agentExecutionContracts.endsAt)).all();
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
      .limit(1);

    const contract = row[0];

    if (!contract) {
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
      contractIds.map((contractId) => {
        const spentUsd = spentUsdByContractId.get(contractId) ?? 0;
        const recentSteps = recentStepsByContractId.get(contractId) ?? [];

        return [
          contractId,
          {
            spentUsd,
            spentPercent: getUsagePercent(spentUsd, contractBudgetById.get(contractId) ?? 0),
            averageStepIntervalMinutes: getAverageStepIntervalMinutes(recentSteps),
            averageStepIntervalLabel: formatAverageStepInterval(recentSteps),
            recentStepCount: recentSteps.length,
            daysRemaining: Math.max(
              Math.ceil(((contractEndsAtById.get(contractId) ?? now) - now) / 86_400_000),
              0,
            ),
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
  };
}

function getUsagePercent(spentUsd: number, budgetUsd: number) {
  if (budgetUsd <= 0) {
    return 0;
  }

  return (spentUsd / budgetUsd) * 100;
}

function getAverageStepIntervalMinutes(
  steps: Array<{
    createdAt: number;
  }>,
) {
  if (steps.length < 2) {
    return null;
  }

  const sortedSteps = [...steps].sort((left, right) => left.createdAt - right.createdAt);
  let totalDiff = 0;

  for (let index = 1; index < sortedSteps.length; index += 1) {
    totalDiff += sortedSteps[index].createdAt - sortedSteps[index - 1].createdAt;
  }

  return Math.round(totalDiff / (sortedSteps.length - 1) / 60000);
}

function formatAverageStepInterval(
  steps: Array<{
    createdAt: number;
  }>,
) {
  const totalMinutes = getAverageStepIntervalMinutes(steps);

  if (totalMinutes === null) {
    return 'Sem dados';
  }

  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (minutes === 0) {
    return `${hours} h`;
  }

  return `${hours} h ${minutes} min`;
}

function movementTimestamp() {
  return sql<number>`coalesce(${companyCashLedger.effectiveAt}, ${companyCashLedger.dueAt}, ${companyCashLedger.createdAt})`;
}

function startOfCurrentMonth(now: number) {
  const date = new Date(now);
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
}
