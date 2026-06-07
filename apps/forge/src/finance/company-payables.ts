import { and, eq, gte } from 'drizzle-orm';
import { errorMsg } from '../agents/error-formatting';
import { forgeDebug } from '@forge-runtime/core';
import { createId } from '../utils/id';

import type { Database } from '../database/client';
import type { InferModel } from 'drizzle-orm';
import { companyCashLedger, companyRecurringPayables } from '../database/schema';

type RecurrencePeriod = 'weekly' | 'monthly' | 'yearly';

type PayableRow = InferModel<typeof companyRecurringPayables>;

export type CompanyPayablesStore = ReturnType<typeof createCompanyPayables>;

export function createCompanyPayables(db: Database) {
  async function listRecurringPayables() {
    try {
      const rows = await db.query.companyRecurringPayables.findMany({
        orderBy: (fields, { asc }) => [asc(fields.name)],
      });

      return rows.map((row: PayableRow) => {
        const { id, recurrencePeriod, isActive, ...rest } = row;

        return {
          ...rest,
          payableId: id,
          description: rest.description ?? undefined,
          recurrencePeriod: recurrencePeriod as RecurrencePeriod,
          isActive: isActive === 1,
        };
      });
    } catch (err) {
      forgeDebug({
        scope: 'company-payables',
        level: 'error',
        message: 'Failed to list recurring payables',
        context: { error: errorMsg(err) },
      });
      throw err;
    }
  }

  async function createRecurringPayable(input: {
    name: string;
    description?: string;
    amountUsd: number;
    recurrencePeriod: RecurrencePeriod;
    dueAt: number;
  }) {
    const now = Date.now();
    const payableId = createId();

    try {
      // Wrap payable insert + planned occurrence in transaction
      const entryId = await db.transaction(async (tx) => {
        await tx.insert(companyRecurringPayables).values({
          id: payableId,
          name: input.name,
          description: input.description,
          amountUsd: input.amountUsd,
          recurrencePeriod: input.recurrencePeriod,
          nextDueAt: input.dueAt,
          isActive: 1,
          createdAt: now,
          updatedAt: now,
        });

        const eid = createId();
        await tx.insert(companyCashLedger).values({
          id: eid,
          type: 'recurring-payable',
          direction: 'out',
          amountUsd: input.amountUsd,
          description: input.description ?? input.name,
          referenceType: 'recurring-payable',
          referenceId: payableId,
          status: 'planned',
          dueAt: input.dueAt,
          effectiveAt: null,
          createdAt: now,
          updatedAt: now,
        });
        return eid;
      });

      return {
        payableId,
        entryId,
      };
    } catch (err) {
      forgeDebug({
        scope: 'company-payables',
        level: 'error',
        message: 'Failed to create recurring payable',
        context: {
          payableId,
          name: input.name,
          error: errorMsg(err),
        },
      });
      throw err;
    }
  }

  async function setRecurringPayableActive(payableId: string, isActive: boolean) {
    const now = Date.now();

    try {
      const payable = await db.query.companyRecurringPayables.findFirst({
        where: eq(companyRecurringPayables.id, payableId),
      });

      // #5546: findFirst returns T | undefined. The previous
      // `=== null || === undefined` check was redundant (Drizzle never
      // returns null from findFirst).
      if (!payable) {
        forgeDebug({
          scope: 'company-payables',
          level: 'warn',
          // #5547: was copy-pasted from cancelRecurringPayable. The current
          // function is setRecurringPayableActive, so on-call grep matches.
          message: 'setRecurringPayableActive: payable not found',
          context: { payableId },
        });
        throw new Error(`Recurring payable not found: ${payableId}`);
      }

      // #5551: use a single `const now` to keep updatedAt coherent and
      // match the pattern used by createRecurringPayable.
      await db
        .update(companyRecurringPayables)
        .set({
          isActive: isActive ? 1 : 0,
          updatedAt: now,
        })
        .where(eq(companyRecurringPayables.id, payableId));

      return {
        payableId,
        isActive,
      };
    } catch (err) {
      forgeDebug({
        scope: 'company-payables',
        level: 'error',
        message: 'Failed to set recurring payable active',
        context: { payableId, isActive, error: errorMsg(err) },
      });
      throw err;
    }
  }

  async function syncRecurringPayableOccurrence(input: { entryId: string }) {
    try {
      const entry = await db.query.companyCashLedger.findFirst({
        where: eq(companyCashLedger.id, input.entryId),
      });

      // #5546: drop the redundant `=== null || === undefined` checks.
      // Drizzle's findFirst returns T | undefined, and referenceId is
      // `text('reference_id')` (nullable), so `=== null` is the only
      // narrowing check we need.
      if (!entry || entry.referenceType !== 'recurring-payable' || entry.referenceId === null) {
        return null;
      }
      // #5546 + #5551: capture narrowed local so the inner function body
      // (and the update below) don't have to re-narrow.
      const referenceId: string = entry.referenceId;

      const payable = await db.query.companyRecurringPayables.findFirst({
        where: eq(companyRecurringPayables.id, referenceId),
      });

      // #5546: drop redundant null check.
      if (!payable || payable.isActive !== 1) {
        return null;
      }

      const currentDueAt = entry.dueAt ?? payable.nextDueAt;
      const nextDueAt = advanceDueAt(currentDueAt, payable.recurrencePeriod as RecurrencePeriod);

      // #5551: use a single `const now` for the whole transaction so the
      // new ledger entry and the payable update share one timestamp.
      const now = Date.now();
      return await db.transaction(async (tx) => {
        const existingNextEntry = await tx.query.companyCashLedger.findFirst({
          where: and(
            eq(companyCashLedger.referenceType, 'recurring-payable'),
            eq(companyCashLedger.referenceId, payable.id),
            eq(companyCashLedger.status, 'planned'),
            gte(companyCashLedger.dueAt, nextDueAt),
          ),
        });

        if (existingNextEntry != null) {
          return null;
        }

        const eid = createId();
        await tx.insert(companyCashLedger).values({
          id: eid,
          type: 'recurring-payable',
          direction: 'out',
          amountUsd: payable.amountUsd,
          description: payable.description ?? payable.name,
          referenceType: 'recurring-payable',
          referenceId: payable.id,
          status: 'planned',
          dueAt: nextDueAt,
          effectiveAt: null,
          createdAt: now,
          updatedAt: now,
        });

        await tx
          .update(companyRecurringPayables)
          .set({
            nextDueAt,
            updatedAt: now,
          })
          .where(eq(companyRecurringPayables.id, payable.id));

        return {
          payableId: payable.id,
          nextDueAt,
        };
      });
    } catch (err) {
      forgeDebug({
        scope: 'company-payables',
        level: 'error',
        message: 'Failed to sync recurring payable occurrence',
        context: {
          entryId: input.entryId,
          error: errorMsg(err),
        },
      });
      throw err;
    }
  }

  return {
    listRecurringPayables,
    createRecurringPayable,
    setRecurringPayableActive,
    syncRecurringPayableOccurrence,
  };
}

/**
 * Advances a dueAt timestamp by one recurrence period.
 *
 * #5550: rewritten as an exhaustive switch with `never` to prevent the
 * dead `return currentDueAt;` fallback from masking future enum additions.
 * The Date is mutated locally and returned as a timestamp, preserving the
 * previous behavior for the 3 current RecurrencePeriod values.
 */
function advanceDueAt(currentDueAt: number, recurrencePeriod: RecurrencePeriod): number {
  const date = new Date(currentDueAt);
  switch (recurrencePeriod) {
    case 'weekly':
      date.setDate(date.getDate() + 7);
      break;
    case 'monthly':
      date.setMonth(date.getMonth() + 1);
      break;
    case 'yearly':
      date.setFullYear(date.getFullYear() + 1);
      break;
    default: {
      const _exhaustive: never = recurrencePeriod;
      throw new Error(`Unknown recurrencePeriod: ${String(_exhaustive)}`);
    }
  }
  return date.getTime();
}
