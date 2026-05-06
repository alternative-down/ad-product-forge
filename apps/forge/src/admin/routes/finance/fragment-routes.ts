/**
 * Fragmented Finance Routes — #1589
 *
 * Replaces the monolithic GET /admin/finance (which executed 5 parallel queries:
 * balance, summary, movements, recurringPayables) with 4 focused routes.
 */

import type { MicroErpReadModel } from '../../micro-erp/read-model';
import type { CompanyPayablesStore } from '../../finance/company-payables';
import { jsonResponse } from '../index';

interface FinanceFragmentReadModel {
  getFinanceBalance: () => Promise<unknown>;
  getFinanceSummary: () => Promise<unknown>;
  listFinanceMovements: (input: { cursor?: number; limit?: number }) => Promise<unknown>;
  listRecurringPayables: () => Promise<unknown>;
}

/**
 * Register fragmented finance routes on the HTTP server.
 */
export function registerFinanceFragmentRoutes(
  httpServer: {
    registerRoute: (route: {
      method: 'GET';
      path: string;
      handler: (req: unknown) => unknown;
    }) => void;
  },
  finance: MicroErpReadModel,
  payables: CompanyPayablesStore,
) {
  // GET /admin/finance/balance — single focused query
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/finance/balance',
    handler: async () => jsonResponse(await finance.getCompanyCashBalance()),
  });

  // GET /admin/finance/summary — single focused query
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/finance/summary',
    handler: async () => jsonResponse(await finance.getCompanyCashSummary()),
  });

  // GET /admin/finance/movements — single focused query
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/finance/movements',
    handler: async (req: unknown) => {
      const url = (req as { url?: string }).url ?? '';
      const params = new URLSearchParams(url.split('?')[1] ?? '');
      const cursor = params.get('cursor') ? Number(params.get('cursor')) : undefined;
      const limit = params.get('limit') ? Number(params.get('limit')) : 50;
      const movements = await finance.listCompanyCashMovements({ cursor, limit });
      return jsonResponse(movements);
    },
  });

  // GET /admin/finance/recurring — single focused query
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/finance/recurring',
    handler: async () => jsonResponse(await payables.listRecurringPayables()),
  });
}