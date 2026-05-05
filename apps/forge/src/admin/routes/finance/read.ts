/**
 * Finance Admin Routes - Extracted from routes.ts
 * GET routes for finance overview and contracts
 */

import type { HttpHandler } from '../../../http/server.js';
import { jsonResponse } from '../index';

export interface FinanceReadModel {
  getFinanceBalance: () => Promise<unknown>;
  getFinanceSummary: () => Promise<unknown>;
  getFinanceMovements: (limit: number, offset: number) => Promise<unknown>;
  getFinanceRecurring: () => Promise<unknown>;
  getFinanceContracts: () => Promise<unknown>;
}

/**
 * Register GET routes for finance read operations
 */
export function registerFinanceReadRoutes(
  httpServer: { registerRoute: (route: { method: "GET" | "POST" | "PATCH" | "DELETE"; path: string; handler: HttpHandler }) => void },
  readModel: FinanceReadModel
) {
  // GET /admin/finance
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/finance',
    handler: async () => jsonResponse(await readModel.getFinanceBalance()),
  });

  // GET /admin/finance/balance
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/finance/balance',
    handler: async () => jsonResponse(await readModel.getFinanceBalance()),
  });

  // GET /admin/finance/summary
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/finance/summary',
    handler: async () => jsonResponse(await readModel.getFinanceSummary()),
  });

  // GET /admin/finance/movements?limit=50&offset=0
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/finance/movements',
    handler: async (request) => {
      const url = new URL(request.url);
      const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);
      const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);
      return jsonResponse(await readModel.getFinanceMovements(limit, offset));
    },
  });

  // GET /admin/finance/recurring
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/finance/recurring',
    handler: async () => jsonResponse(await readModel.getFinanceRecurring()),
  });

  // GET /admin/finance/contracts
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/finance/contracts',
    handler: async () => jsonResponse(await readModel.getFinanceContracts()),
  });
}
