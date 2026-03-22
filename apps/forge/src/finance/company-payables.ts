import { and, eq, gte } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

import type { Database } from '../database/index';
import { companyCashLedger, companyRecurringPayables } from '../database/schema';

type RecurrencePeriod = 'weekly' | 'monthly' | 'yearly';

export function createCompanyPayables(db: Database) {
  async function listRecurringPayables() {
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

    await db.insert(companyRecurringPayables).values({
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

    const entryId = await createPlannedOccurrence({
      payableId,
      name: input.name,
      description: input.description,
      amountUsd: input.amountUsd,
      dueAt: input.dueAt,
    });

    return {
      payableId,
      entryId,
    };
  }

  async function setRecurringPayableActive(payableId: string, isActive: boolean) {
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
  }

  async function syncRecurringPayableOccurrence(input: {
    entryId: string;
  }) {
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

    if (!existingNextEntry) {
      await createPlannedOccurrence({
        payableId: payable.id,
        name: payable.name,
        description: payable.description ?? undefined,
        amountUsd: payable.amountUsd,
        dueAt: nextDueAt,
      });
    }

    await db
      .update(companyRecurringPayables)
      .set({
        nextDueAt,
        updatedAt: Date.now(),
      })
      .where(eq(companyRecurringPayables.id, payable.id));

    return {
      payableId: payable.id,
      nextDueAt,
    };
  }

  return {
    listRecurringPayables,
    createRecurringPayable,
    setRecurringPayableActive,
    syncRecurringPayableOccurrence,
  };

  async function createPlannedOccurrence(input: {
    payableId: string;
    name: string;
    description?: string;
    amountUsd: number;
    dueAt: number;
  }) {
    const entryId = createId();

    await db.insert(companyCashLedger).values({
      id: entryId,
      type: 'recurring-payable',
      direction: 'out',
      amountUsd: input.amountUsd,
      description: input.description ?? input.name,
      referenceType: 'recurring-payable',
      referenceId: input.payableId,
      status: 'planned',
      dueAt: input.dueAt,
      effectiveAt: null,
      createdAt: Date.now(),
    });

    return entryId;
  }
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

  date.setFullYear(date.getFullYear() + 1);
  return date.getTime();
}
