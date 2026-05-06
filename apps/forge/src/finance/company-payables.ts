import { and, eq, gte } from 'drizzle-orm';
import { forgeDebug } from '@forge-runtime/core';
import { createId } from '../utils/id';

import type { Database } from '../database/index';
import { companyCashLedger, companyRecurringPayables } from '../database/schema';

type RecurrencePeriod = 'weekly' | 'monthly' | 'yearly';

export function createCompanyPayables(db: Database) {
  async function listRecurringPayables() {
    try {
      const rows = await db.query.companyRecurringPayables.findMany({
        orderBy: (fields, { asc }) => [asc(fields.name)],
      });

      return rows.map((row) => {
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
      forgeDebug({ scope: 'finance', level: 'info', message: 'Failed to list recurring payables', context: { error: err } });
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
        });
        return eid;
      });

      return {
        payableId,
        entryId,
      };
    } catch (err) {
      forgeDebug({ scope: 'finance', level: 'info', message: 'Failed to create recurring payable', context: { payableId, name: input.name, error: err } });
      throw err;
    }
  }

  async function setRecurringPayableActive(payableId: string, isActive: boolean) {
    try {
      const payable = await db.query.companyRecurringPayables.findFirst({
        where: eq(companyRecurringPayables.id, payableId),
      });

      if (!payable) {
        throw new Error(`Recurring payable not found: ${payableId}`);
      }

      await db
        .update(companyRecurringPayables)
        .set({
          isActive: isActive ? 1 : 0,
          updatedAt: Date.now(),
        })
        .where(eq(companyRecurringPayables.id, payableId));

      return {
        payableId,
        isActive,
      };
    } catch (err) {
      forgeDebug({ scope: 'finance', level: 'info', message: 'Failed to set recurring payable active', context: { payableId, isActive, error: err } });
      throw err;
    }
  }

  async function syncRecurringPayableOccurrence(input: {
    entryId: string;
  }) {
    try {
      const entry = await db.query.companyCashLedger.findFirst({
        where: eq(companyCashLedger.id, input.entryId),
      });

      if (!entry || entry.referenceType !== 'recurring-payable' || !entry.referenceId) {
        return null;
      }

      const payable = await db.query.companyRecurringPayables.findFirst({
        where: eq(companyRecurringPayables.id, entry.referenceId),
      });

      if (!payable || payable.isActive !== 1) {
        return null;
      }

      const currentDueAt = entry.dueAt ?? payable.nextDueAt;
      const nextDueAt = advanceDueAt(currentDueAt, payable.recurrencePeriod as RecurrencePeriod);
      const existingNextEntry = await db.query.companyCashLedger.findFirst({
        where: and(
          eq(companyCashLedger.referenceType, 'recurring-payable'),
          eq(companyCashLedger.referenceId, payable.id),
          eq(companyCashLedger.status, 'planned'),
          gte(companyCashLedger.dueAt, nextDueAt),
        ),
      });

      if (existingNextEntry) {
        return null;
      }

      // Wrap planned occurrence + payable update in transaction
      await db.transaction(async (tx) => {
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
          createdAt: Date.now(),
        });

        await tx
          .update(companyRecurringPayables)
          .set({
            nextDueAt,
            updatedAt: Date.now(),
          })
          .where(eq(companyRecurringPayables.id, payable.id));
      });

      return {
        payableId: payable.id,
        nextDueAt,
      };
    } catch (err) {
      forgeDebug({ scope: 'finance', level: 'info', message: 'Failed to sync recurring payable occurrence', context: { entryId: input.entryId, error: err } });
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

function advanceDueAt(currentDueAt: number, recurrencePeriod: RecurrencePeriod) {
  const date = new Date(currentDueAt);

  if (recurrencePeriod === 'weekly') {
    date.setDate(date.getDate() + 7);
    return date.getTime();
  }

  if (recurrencePeriod === 'monthly') {
    date.setMonth(date.getMonth() + 1);
    return date.getTime();
  }

  if (recurrencePeriod === 'yearly') {
    date.setFullYear(date.getFullYear() + 1);
    return date.getTime();
  }

  return currentDueAt;
}
