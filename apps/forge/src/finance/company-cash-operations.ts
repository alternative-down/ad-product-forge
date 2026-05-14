import { eq, type SQLiteTransaction } from 'drizzle-orm';
import { createId } from '../utils/id';
import { forgeDebug } from '@forge-runtime/core';


import type {Database} from '../database/schema';
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
    } catch (err) {
    forgeDebug({ scope: 'company-cash-operations', level: 'info', message: 'createEntry', context: { error: err instanceof Error ? err.message : String(err), type: input.type } });
    throw err;

    return { entryId, status: 'canceled' as const };
  }

  async function postPlannedEntry(entryId: string, input: { effectiveAt?: number } = {}) {
    const entry = await getEntry(entryId);
    if (!entry) {
      forgeDebug({ scope: 'company-cash-operations', level: 'warn', message: 'cancelPlannedEntry: entry not found', context: { entryId } });
      throw new Error(`Company cash entry not found: ${entryId}`);
    }
    if (entry.status !== 'planned') throw new Error(`Only planned company cash entries can be posted: ${entryId}`);

    const effectiveAt = input.effectiveAt ?? Date.now();
    await db
      .update(companyCashLedger)
      .set({ status: 'posted', effectiveAt })
      .where(eq(companyCashLedger.id, entryId));
    } catch (err) {
    forgeDebug({ scope: 'company-cash-operations', level: 'info', message: 'postPlannedEntry', context: { error: err instanceof Error ? err.message : String(err), entryId, effectiveAt } });
    throw err;
  }

  return {
    createEntry,
    recordCashIn,
    recordCashOut,
    scheduleCashIn,
    scheduleCashOut,
    cancelPlannedEntry,
    postPlannedEntry,
    getEntry,  };
}
