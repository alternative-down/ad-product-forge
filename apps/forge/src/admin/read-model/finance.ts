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
    try {
      const [overview, recurringPayables] = await Promise.all([
        getFinanceOverview(finance),
        getRecurringPayables(payables),
      ]);

      return {
        ...overview,
        recurringPayables,
      };
    } catch (err) {
      forgeDebug({ scope: 'finance-readmodel', level: 'error', message: '[finance-readmodel] getFinance failed', context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }

  async function getFinanceContracts() {
    try {
      const contracts = await finance.listActiveInternalAgentContracts();

      if (!contracts || !Array.isArray(contracts.items)) {
        return { items: [], hasMore: false };
      }

      const contractIds = contracts.items.map((contract) => contract.contractId);

      if (contractIds.length === 0) {
        return { ...contracts, hasMore: false };
      }

      const spendRows = await db
        .select({
          contractId: agentExecutionSteps.contractId,
          total: sql<number>`coalesce(sum(${agentExecutionSteps.costUsd}), 0)`,
        })
        .from(agentExecutionSteps)
        .where(inArray(agentExecutionSteps.contractId, contractIds))
        .groupBy(agentExecutionSteps.contractId).all();

      const spentUsdByContractId = new Map<string, number>();
      for (const row of spendRows) {
        spentUsdByContractId.set(row.contractId, Number(row.total));
      }

      return {
        ...contracts,
        hasMore: false,
        items: contracts.items.map((contract) => {
          const spentUsd = spentUsdByContractId.get(contract.contractId) ?? 0;

          return {
            ...contract,
            spentUsd,
            spentPercent: contract.weeklyValueUsd > 0
              ? (spentUsd / contract.weeklyValueUsd) * 100
              : 0,
          };
        }),
      };
    } catch (err) {
      forgeDebug({ scope: 'finance-readmodel', level: 'error', message: '[finance-readmodel] getFinanceContracts failed', context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }

  return {
    getFinance,
    getFinanceContracts,
  };
}
