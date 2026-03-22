import { and, desc, eq, gte, lte, ne, sql } from 'drizzle-orm';

import type { Database } from '../database/index';
import { agents, agentExecutionContracts, companyCashLedger } from '../database/schema';
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
        id: row.id,
        type: row.type,
        direction: row.direction as 'in' | 'out',
        amountUsd: row.amountUsd,
        description: row.description ?? undefined,
        status: row.status,
        dueAt: row.dueAt ?? undefined,
        effectiveAt: row.effectiveAt ?? undefined,
        createdAt: row.createdAt,
      })),
      total: countRows[0]?.total ?? 0,
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
      .orderBy(desc(agentExecutionContracts.endsAt));

    return {
      items: rows.map((row) => ({
        contractId: row.contractId,
        agentId: row.agentId,
        agentName: row.agentName,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        weeklyValueUsd: row.weeklyValueUsd,
        autoRenew: Boolean(row.autoRenew),
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

    return {
      contractId: contract.contractId,
      agentId: contract.agentId,
      agentName: contract.agentName,
      startsAt: contract.startsAt,
      endsAt: contract.endsAt,
      weeklyValueUsd: contract.weeklyValueUsd,
      autoRenew: Boolean(contract.autoRenew),
    };
  }

  return {
    getCompanyCashBalance,
    listCompanyCashMovements,
    getCompanyCashSummary,
    listActiveInternalAgentContracts,
    getActiveInternalAgentContract,
  };
}

function movementTimestamp() {
  return sql<number>`coalesce(${companyCashLedger.effectiveAt}, ${companyCashLedger.dueAt}, ${companyCashLedger.createdAt})`;
}

function startOfCurrentMonth(now: number) {
  const date = new Date(now);
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
}
