import { eq, type SQLiteTransaction } from 'drizzle-orm';
import { createId } from '../utils/id';

import type { Database } from '../database/index';
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

type DbSession = Database | SQLiteTransaction<'async', Record<string, never>, Record<string, never>>;

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
    });

    return {
      entryId,
    };
  }

  async function recordCashIn(
    input: CompanyCashEntryInput & {
      effectiveAt?: number;
    },
    session?: DbSession,
  ) {
    return createEntry(
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
    input: CompanyCashEntryInput & {
      effectiveAt?: number;
    },
    session?: DbSession,
  ) {
    return createEntry(
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
    input: CompanyCashEntryInput & {
      dueAt: number;
    },
    session?: DbSession,
  ) {
    return createEntry(
      {
        ...input,
        direction: 'in',
        status: 'planned',
        dueAt: input.dueAt,
      },
      session,
    );
  }

  async function scheduleCashOut(
    input: CompanyCashEntryInput & {
      dueAt: number;
    },
    session?: DbSession,
  ) {
    return createEntry(
      {
        ...input,
        direction: 'out',
        status: 'planned',
        dueAt: input.dueAt,
      },
      session,
    );
  }

  async function cancelPlannedEntry(entryId: string) {
    const entry = await getEntry(entryId);

    if (!entry) {
      throw new Error(`Company cash entry not found: ${entryId}`);
    }

    if (entry.status !== 'planned') {
      throw new Error(`Only planned company cash entries can be canceled: ${entryId}`);
    }

    await db
      .update(companyCashLedger)
      .set({
        status: 'canceled',
      })
      .where(eq(companyCashLedger.id, entryId));

    return {
      entryId,
      status: 'canceled' as const,
    };
  }

  async function postPlannedEntry(entryId: string, input: {
    effectiveAt?: number;
  } = {}) {
    const entry = await getEntry(entryId);

    if (!entry) {
      throw new Error(`Company cash entry not found: ${entryId}`);
    }

    if (entry.status !== 'planned') {
      throw new Error(`Only planned company cash entries can be posted: ${entryId}`);
    }

    const effectiveAt = input.effectiveAt ?? Date.now();

    await db
      .update(companyCashLedger)
      .set({
        status: 'posted',
        effectiveAt,
      })
      .where(eq(companyCashLedger.id, entryId));

    return {
      entryId,
      status: 'posted' as const,
      effectiveAt,
    };
  }

  async function getEntry(entryId: string) {
    return db.query.companyCashLedger.findFirst({
      where: eq(companyCashLedger.id, entryId),
    });
  }

  return {
    recordCashIn,
    recordCashOut,
    scheduleCashIn,
    scheduleCashOut,
    cancelPlannedEntry,
    postPlannedEntry,
  };
}
