import { inArray, sql } from 'drizzle-orm';
import { createMicroErpReadModel } from '../../micro-erp/read-model';
import { createCompanyPayables } from '../../finance/company-payables';
import { agentExecutionSteps } from '../../database/schema';
import { getFinanceOverview } from './finance-overview';
import { getRecurringPayables } from './payables-overview';
import { forgeDebug } from '@forge-runtime/core';
import type { Database } from '../../database/index';

export interface FinanceReadModel {
  getFinance: () => Promise<Awaited<ReturnType<typeof getFinanceOverview>> & {
    recurringPayables: Awaited<ReturnType<typeof getRecurringPayables>>;
  }>;
  getFinanceContracts: () => Promise<{
    items: Array<{
      contractId: string;
      agentId: string;
      status: string;
      weeklyValueUsd: number;
      createdAt: string;
      updatedAt: string;
      roleId: string | null;
      spentUsd: number;
      spentPercent: number;
    }>;
    hasMore: boolean;
  }>;
}

export function createFinanceReadModel(input: { db: Database }): FinanceReadModel {
  const db = input.db;
  const finance = createMicroErpReadModel(db);
  const payables = createCompanyPayables(db);

  async function getFinance() {
    const [overview, recurringPayables] = await Promise.all([
      getFinanceOverview(finance),
      getRecurringPayables(payables),
    ]);

    return {
      ...overview,
      recurringPayables,
    };
    } catch (err) {
    forgeDebug({ scope: 'admin-read-model-finance', level: 'error', message: '[finance-readmodel] getFinance failed', context: { error: err instanceof Error ? err.message : String(err) }});
    throw err;
  }

  return {
    getFinance,
    getFinanceContracts,
  };
}
