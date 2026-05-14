import { and, eq, gte } from 'drizzle-orm';
import { forgeDebug } from '@forge-runtime/core';
import { createId } from '../utils/id';


import type {Database} from '../database/schema';
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
    } catch (err) {
    forgeDebug({ scope: 'company-payables', level: 'info', message: 'Failed to list recurring payables', context: { error: err instanceof Error ? err.message : String(err) } });
    throw err;
  }

  async function setRecurringPayableActive(payableId: string, isActive: boolean) {
    const payable = await db.query.companyRecurringPayables.findFirst({
      where: eq(companyRecurringPayables.id, payableId),
    });

    if (!payable) {
      forgeDebug({ scope: 'company-payables', level: 'warn', message: 'cancelRecurringPayable: payable not found', context: { payableId } });
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
    forgeDebug({ scope: 'company-payables', level: 'info', message: 'Failed to set recurring payable active', context: { payableId, isActive, error: err instanceof Error ? err.message : String(err) } });
    throw err;
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
