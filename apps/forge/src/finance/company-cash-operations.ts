import { eq } from 'drizzle-orm';
import { errorMsg } from '../agents/error-formatting';
import { createId } from '../utils/id';
import { forgeDebug } from '@forge-runtime/core';

import type { Database } from '../database/client';
import { companyCashLedger } from '../database/schema';

type CompanyCashDirection = 'in' | 'out';
type CompanyCashStatus = 'planned' | 'posted' | 'canceled';

type CompanyCashEntryInput = {
  type: string;
  amountUsd: number;
  description?: string;
  referenceType?: string;
  referenceId?: string;
};

type DbSession = Database;

export function createCompanyCashOperations(db: Database) {
  async function createEntry(
    input: CompanyCashEntryInput & {
      direction: CompanyCashDirection;
      status: CompanyCashStatus;
      dueAt?: number;
      effectiveAt?: number;
    },
    session: DbSession = db,
  ) {
    const now = Date.now();
    const entryId = createId();

    try {
      await session.insert(companyCashLedger).values({
        id: entryId,
        type: input.type,
        direction: input.direction,
        amountUsd: input.amountUsd,
        description: input.description,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        status: input.status,
        dueAt: input.dueAt ?? now,
        effectiveAt: input.effectiveAt ?? (input.status === 'posted' ? now : null),
        createdAt: now,
        updatedAt: now,
      });
    } catch (err) {
      forgeDebug({
        scope: 'company-cash-operations',
        level: 'error',
        message: 'createEntry DB insert failed',
        context: {
          error: errorMsg(err),
          entryId,
          type: input.type,
          direction: input.direction,
          amountUsd: input.amountUsd,
        },
      });
      throw err;
    }

    return { entryId };
  }

  async function recordCashIn(
    input: CompanyCashEntryInput & { effectiveAt?: number },
    session?: DbSession,
  ) {
    return await createEntry(
      {
        ...input,
        direction: 'in',
        status: 'posted',
        dueAt: input.effectiveAt,
        effectiveAt: input.effectiveAt,
      },
      session,
    );
  }

  async function recordCashOut(
    input: CompanyCashEntryInput & { effectiveAt?: number },
    session?: DbSession,
  ) {
    return await createEntry(
      {
        ...input,
        direction: 'out',
        status: 'posted',
        dueAt: input.effectiveAt,
        effectiveAt: input.effectiveAt,
      },
      session,
    );
  }

  async function scheduleCashIn(
    input: CompanyCashEntryInput & { dueAt: number },
    session?: DbSession,
  ) {
    return await createEntry(
      { ...input, direction: 'in', status: 'planned', dueAt: input.dueAt },
      session,
    );
  }

  async function scheduleCashOut(
    input: CompanyCashEntryInput & { dueAt: number },
    session?: DbSession,
  ) {
    return await createEntry(
      { ...input, direction: 'out', status: 'planned', dueAt: input.dueAt },
      session,
    );
  }

  async function cancelPlannedEntry(entryId: string) {
    const entry = await getEntry(entryId);
    if (!entry) {
      forgeDebug({
        scope: 'company-cash-operations',
        level: 'warn',
        message: 'cancelPlannedEntry: entry not found',
        context: { entryId },
      });
      throw new Error(`Company cash entry not found: ${entryId}`);
    }
    if (entry.status !== 'planned') {
      forgeDebug({
        scope: 'company-cash-operations',
        level: 'warn',
        message: 'cancelPlannedEntry: entry not planned',
        context: { entryId, status: entry.status },
      });
      throw new Error(`Only planned company cash entries can be canceled: ${entryId}`);
    }

    try {
      await db
        .update(companyCashLedger)
        .set({ status: 'canceled' })
        .where(eq(companyCashLedger.id, entryId));
    } catch (err) {
      forgeDebug({
        scope: 'company-cash-operations',
        level: 'error',
        message: 'cancelPlannedEntry',
        context: { error: errorMsg(err), entryId },
      });
      throw err;
    }

    return { entryId, status: 'canceled' as const };
  }

  async function postPlannedEntry(entryId: string, input: { effectiveAt?: number } = {}) {
    const entry = await getEntry(entryId);
    if (!entry) {
      forgeDebug({
        scope: 'company-cash-operations',
        level: 'warn',
        message: 'cancelPlannedEntry: entry not found',
        context: { entryId },
      });
      throw new Error(`Company cash entry not found: ${entryId}`);
    }
    if (entry.status !== 'planned')
      throw new Error(`Only planned company cash entries can be posted: ${entryId}`);

    const effectiveAt = input.effectiveAt ?? Date.now();
    try {
      await db
        .update(companyCashLedger)
        .set({ status: 'posted', effectiveAt })
        .where(eq(companyCashLedger.id, entryId));
    } catch (err) {
      forgeDebug({
        scope: 'company-cash-operations',
        level: 'error',
        message: 'postPlannedEntry',
        context: { error: errorMsg(err), entryId, effectiveAt },
      });
      throw err;
    }

    return { entryId, status: 'posted' as const, effectiveAt };
  }

  async function getEntry(entryId: string) {
    return await db.query.companyCashLedger.findFirst({
      where: eq(companyCashLedger.id, entryId),
    });
  }

  return {
    createEntry,
    recordCashIn,
    recordCashOut,
    scheduleCashIn,
    scheduleCashOut,
    cancelPlannedEntry,
    postPlannedEntry,
    getEntry,
  };
}
