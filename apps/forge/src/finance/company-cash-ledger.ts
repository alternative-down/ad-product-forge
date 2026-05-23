import { and, eq, isNotNull, lte, sql } from 'drizzle-orm';
import { errorMsg } from '../agents/agent-runner-error-formatting';
import { createId } from '../utils/id';

import { forgeDebug } from '@forge-runtime/core';

import type { Database } from '../database/schema';
import { companyCashLedger } from '../database/schema';
type CompanyCashDirection = 'in' | 'out';
type CompanyCashStatus = 'planned' | 'posted' | 'canceled';

export function createCompanyCashLedger(db: Database) {
  async function getCurrentBalanceUsd(): Promise<number> {
    try {
      const rows = await db
        .select({
          total: sql<number>`coalesce(sum(case when ${companyCashLedger.direction} = 'in' then ${companyCashLedger.amountUsd} else -${companyCashLedger.amountUsd} end), 0)`,
        })
        .from(companyCashLedger)
        .where(
          and(
            eq(companyCashLedger.status, 'posted'),
            isNotNull(companyCashLedger.effectiveAt),
            lte(companyCashLedger.effectiveAt, Date.now()),
          ),
        );

      const r = rows as unknown as { total: number }[];
      return r?.[0]?.total ?? 0;
    } catch (error) {
      forgeDebug({
        scope: 'company-cash-ledger',
        level: 'error',
        message: 'getCurrentBalanceUsd failed',
        context: { error: errorMsg(error) },
      });
      throw error;
    }
  }

  async function postEntry(input: {
    type: string;
    direction: CompanyCashDirection;
    amountUsd: number;
    description?: string;
    referenceType?: string;
    referenceId?: string;
    status?: CompanyCashStatus;
    dueAt?: number;
    effectiveAt?: number;
  }): Promise<void> {
    try {
      const now = Date.now();

      await (db.insert(companyCashLedger) as any).values({
        id: createId(),
        type: input.type,
        direction: input.direction,
        amountUsd: input.amountUsd,
        description: input.description,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        status: input.status ?? 'posted',
        dueAt: input.dueAt ?? now,
        effectiveAt: input.effectiveAt ?? now,
        createdAt: now,
      });
    } catch (error) {
      forgeDebug({
        scope: 'company-cash-ledger',
        level: 'error',
        message: 'postEntry failed',
        context: {
          error: errorMsg(error),
          input: { type: input.type, direction: input.direction, amountUsd: input.amountUsd },
        },
      });
      throw error;
    }
  }

  return {
    getCurrentBalanceUsd,
    postEntry,
  };
}
