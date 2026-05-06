/**
 * Finance Admin Routes
 *
 * Refactored from createAdminReadModel (#1555 split).
 * Each route creates only the stores it needs.
 */
import { inArray, sql } from 'drizzle-orm';

import type { HttpHandler } from '../../../http/server.js';
import type { Database } from '../../../database/index';
import { agentExecutionSteps } from '../../../database/schema';
import type { MicroErpReadModel } from '../../../micro-erp/read-model';
import type { CompanyPayables } from '../../../finance/company-payables';
import { jsonResponse } from '../index';
import { getFinanceOverview } from '../read-model/finance-overview';
import { getRecurringPayables } from '../read-model/payables-overview';

/**
 * Register GET routes for finance read operations.
 * Finance stores are created here instead of in createAdminReadModel.
 */
export function registerFinanceReadRoutes(
  httpServer: { registerRoute: (route: { method: 'GET' | 'POST' | 'PATCH' | 'DELETE'; path: string; handler: HttpHandler }) => void },
  db: Database,
  finance: MicroErpReadModel,
  payables: CompanyPayables,
) {
  // GET /admin/finance
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/finance',
    handler: async () => {
      const [overview, recurringPayablesResult] = await Promise.all([
        getFinanceOverview(finance),
        getRecurringPayables(payables),
      ]);
      return jsonResponse({ ...overview, recurringPayables: recurringPayablesResult });
    },
  });

  // GET /admin/finance/contracts
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/finance/contracts',
    handler: async () => {
      const contracts = await finance.listActiveInternalAgentContracts();
      if (!contracts || !Array.isArray(contracts.items)) {
        return jsonResponse({ items: [], hasMore: false });
      }

      const contractIds = contracts.items.map((c) => c.contractId);
      if (contractIds.length === 0) {
        return jsonResponse({ ...contracts, hasMore: false });
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

      return jsonResponse({
        ...contracts,
        hasMore: false,
        items: contracts.items.map((contract) => {
          const spentUsd = spentUsdByContractId.get(contract.contractId) ?? 0;
          return {
            ...contract,
            spentUsd,
            spentPercent:
              contract.weeklyValueUsd > 0 ? (spentUsd / contract.weeklyValueUsd) * 100 : 0,
          };
        }),
      });
    },
  });
}
