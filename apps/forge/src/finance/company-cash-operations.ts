import { eq } from 'drizzle-orm';
import { withDbErrorLogging } from '../database/error-logging';
import { createId } from '../utils/id';
import { forgeDebug } from '@forge-runtime/core';

import type { Database } from '../database/client';
import { companyCashLedger } from '../database/schema';
import { type CompanyCashDirection, type CompanyCashStatus } from './company-cash-enums';

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

    await withDbErrorLogging({
      scope: 'company-cash-operations',
      op: 'createEntry',
      verb: 'write',
      context: {
        entryId,
        type: input.type,
        direction: input.direction,
        amountUsd: input.amountUsd,
      },
      fn: async () => {
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
      },
    });

    return { entryId };
  }

  async function recordCash(
    input: CompanyCashEntryInput & { direction: CompanyCashDirection; effectiveAt?: number },
    session?: DbSession,
  ) {
    return await createEntry(
      {
        ...input,
        status: 'posted',
        dueAt: input.effectiveAt,
        effectiveAt: input.effectiveAt,
      },
      session,
    );
  }

  async function scheduleCash(
    input: CompanyCashEntryInput & { direction: CompanyCashDirection; dueAt: number },
    session?: DbSession,
  ) {
    return await createEntry(
      { ...input, status: 'planned', dueAt: input.dueAt },
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

    await withDbErrorLogging({
      scope: 'company-cash-operations',
      op: 'cancelPlannedEntry',
      verb: 'write',
      context: { entryId },
      fn: async () => {
        await db
          .update(companyCashLedger)
          .set({ status: 'canceled' })
          .where(eq(companyCashLedger.id, entryId));
      },
    });

    return { entryId, status: 'canceled' as const };
  }

  async function postPlannedEntry(entryId: string, input: { effectiveAt?: number } = {}) {
    const entry = await getEntry(entryId);
    if (!entry) {
      forgeDebug({
        scope: 'company-cash-operations',
        level: 'warn',
        message: 'postPlannedEntry: entry not found',
        context: { entryId },
      });
      throw new Error(`Company cash entry not found: ${entryId}`);
    }
    if (entry.status !== 'planned')
      throw new Error(`Only planned company cash entries can be posted: ${entryId}`);

    const effectiveAt = input.effectiveAt ?? Date.now();
    await withDbErrorLogging({
      scope: 'company-cash-operations',
      op: 'postPlannedEntry',
      verb: 'write',
      context: { entryId, effectiveAt },
      fn: async () => {
        await db
          .update(companyCashLedger)
          .set({ status: 'posted', effectiveAt })
          .where(eq(companyCashLedger.id, entryId));
      },
    });

    return { entryId, status: 'posted' as const, effectiveAt };
  }

  async function getEntry(entryId: string) {
    return await db.query.companyCashLedger.findFirst({
      where: eq(companyCashLedger.id, entryId),
    });
  }

  async function getOverview() {
    const entries = await db.select().from(companyCashLedger).limit(50).all();
    return {
      balance: entries.reduce(
        (acc, e) => (e.status === 'posted' ? acc + (e.direction === 'in' ? e.amountUsd : -e.amountUsd) : acc),
        0,
      ),
      entryCount: entries.length,
      recent: entries.slice(0, 10),
    };
  }

  async function listContractSummaries() {
    const entries = await db.select().from(companyCashLedger).limit(20).all();
    return entries
      .filter((e) => e.referenceType === 'contract')
      .map((e) => ({
        id: e.id,
        amountUsd: e.amountUsd,
        status: e.status,
        description: e.description,
      }));
  }

  // Back-compat wrappers. The canonical API is recordCash/scheduleCash (L#NN-50 #15 — see PR5 #5537).
  // These thin wrappers preserve the old function names so callers don't need to migrate.
  // Future PR will remove them and update callers to use the canonical API.
  const recordCashIn = (
    input: CompanyCashEntryInput & { effectiveAt?: number },
    session?: DbSession,
  ) => recordCash({ ...input, direction: 'in' }, session);
  const recordCashOut = (
    input: CompanyCashEntryInput & { effectiveAt?: number },
    session?: DbSession,
  ) => recordCash({ ...input, direction: 'out' }, session);
  const scheduleCashIn = (
    input: CompanyCashEntryInput & { dueAt: number },
    session?: DbSession,
  ) => scheduleCash({ ...input, direction: 'in' }, session);
  const scheduleCashOut = (
    input: CompanyCashEntryInput & { dueAt: number },
    session?: DbSession,
  ) => scheduleCash({ ...input, direction: 'out' }, session);

  return {
    createEntry,
    recordCash,
    recordCashIn,
    recordCashOut,
    scheduleCash,
    scheduleCashIn,
    scheduleCashOut,
    cancelPlannedEntry,
    postPlannedEntry,
    getEntry,
    getOverview,
    listContractSummaries,
  };
}

