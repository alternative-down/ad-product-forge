import { and, eq, isNotNull, lte, sql } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

import type { Database } from '../database/index.js';
import { companyCashLedger } from '../database/schema.js';

type CompanyCashDirection = 'in' | 'out';
type CompanyCashStatus = 'planned' | 'posted' | 'canceled';

export function createCompanyCashLedger(db: Database) {
  async function getCurrentBalanceUsd() {
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

    return rows[0]?.total ?? 0;
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
  }) {
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
    });
  }

  return {
    getCurrentBalanceUsd,
    postEntry,
  };
}
