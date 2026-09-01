import { and, eq, isNotNull, lte, sql } from 'drizzle-orm';
import { withDbErrorLogging } from '../database/error-logging';
import { createId } from '../utils/id';

import type { Database } from '../database/client';
import { companyCashLedger } from '../database/schema';
import { type CompanyCashDirection, type CompanyCashStatus } from './company-cash-enums';


export function createCompanyCashLedger(db: Database) {
  async function getCurrentBalanceUsd(): Promise<number> {
    return await withDbErrorLogging({
      scope: 'company-cash-ledger',
      op: 'getCurrentBalanceUsd',
      verb: 'read',
      context: {},
      fn: async () => {
        // L#NN-50 #33 (D59): drizzle select({total: sql<number>...}) returns
        // Array<{total: number}> natively — no BalanceTotalRow interface or
        // 'as unknown as' cast needed.
        // L#NN-50 #33 (D59): drizzle 0.26 chains need .all() terminal to get a
        // native Array<{total:number}> — await alone leaves the type as SQLiteSelect.
        // The 'as unknown as' cast that previously hid this issue is now removed.
        const rows = await db
          .select({
            total: sql<number>`coalesce(sum(case when ${companyCashLedger.direction} = 'in' then ${companyCashLedger.amountUsd} else -${companyCashLedger.amountUsd} end), 0)`,
          })
          .from(companyCashLedger)
          .where(
            and(
              eq(companyCashLedger.status, 'posted'),
              // #6108 L#NN-50 #23 N=4 (D29): filter to currency='usd' so Asaas BRL
              // entries do NOT inflate the USD balance. BRL conversion to USD is a
              // separate concern tracked outside this fix.
              eq(companyCashLedger.currency, 'usd'),
              isNotNull(companyCashLedger.effectiveAt),
              lte(companyCashLedger.effectiveAt, Date.now()),
            ),
          )
          .all();
        return rows[0]?.total ?? 0;
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

        await db.insert(companyCashLedger).values({
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
          updatedAt: now,
        });
      },
    });
  }

  return {
    getCurrentBalanceUsd,
    postEntry,
  };
}
