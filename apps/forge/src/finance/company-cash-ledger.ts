import { and, eq, isNotNull, lte, sql } from 'drizzle-orm';
import { withDbErrorLogging } from '../database/error-logging';
import { createId } from '../utils/id';

import type { Database } from '../database/client';
import { companyCashLedger } from '../database/schema';
import { type CompanyCashDirection, type CompanyCashStatus } from './company-cash-enums';


export function createCompanyCashLedger(db: Database) {
  interface BalanceTotalRow { total: number }
  async function getCurrentBalanceUsd(): Promise<number> {
    return await withDbErrorLogging({
      scope: 'company-cash-ledger',
      op: 'getCurrentBalanceUsd',
      verb: 'read',
      context: {},
      fn: async () => {
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
        const r = rows as unknown as BalanceTotalRow[];
        return r?.[0]?.total ?? 0;
      },
    });
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
    await withDbErrorLogging({
      scope: 'company-cash-ledger',
      op: 'postEntry',
      verb: 'write',
      context: {
        type: input.type,
        direction: input.direction,
        amountUsd: input.amountUsd,
      },
      fn: async () => {
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
      },
    });
  }

  return {
    getCurrentBalanceUsd,
    postEntry,
  };
}
