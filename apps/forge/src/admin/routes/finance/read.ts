/**
 * Finance Admin Routes - Extracted from routes.ts
 * GET routes for finance overview and contracts
 */

import type { HttpHandler } from '../../../http/server.js';
import { jsonResponse } from '../index';

interface ReadModel {
  getFinance: () => Promise<unknown>;
  getFinanceContracts: () => Promise<unknown>;
}

/**
 * Register GET routes for finance read operations
 */
export function registerFinanceReadRoutes(
  httpServer: { registerRoute: (route: { method: "GET" | "POST" | "PATCH" | "DELETE"; path: string; handler: HttpHandler }) => void },
  readModel: ReadModel
) {
  // GET /admin/finance
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/finance',
    handler: async () => jsonResponse(await readModel.getFinance()),
  });

  // GET /admin/finance/contracts
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/finance/contracts',
    handler: async () => jsonResponse(await readModel.getFinanceContracts()),
  });
}