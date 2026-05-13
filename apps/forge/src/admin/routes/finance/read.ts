/**
 * Finance Admin Read Routes - Extracted from routes.ts
 * GET routes for finance overview and contracts
 */

import { z } from 'zod';
import { forgeDebug } from '../debug';
import type { HttpHandler } from '../../../http/server';
import { jsonResponse } from '../index';

type CompanyCash = {
  getOverview: () => Promise<unknown>;
  listContractSummaries: () => Promise<unknown>;
}

type FinanceReadInput = {
  companyCash: CompanyCash;
}

/**
 * Register GET routes for finance read operations
 */
export function registerFinanceReadRoutes(
  httpServer: { registerRoute: (route: { method: 'GET' | 'POST' | 'PATCH' | 'DELETE'; path: string; handler: HttpHandler }) => void },
  input: FinanceReadInput
) {
  // GET /admin/finance
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/finance',
    handler: async () => {
      try {
        return jsonResponse(await input.companyCash.getOverview());
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Finance overview route failed', context: { error: error instanceof Error ? error.message : String(error) } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  // GET /admin/finance/contracts
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/finance/contracts',
    handler: async () => {
      try {
        return jsonResponse(await input.companyCash.listContractSummaries());
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Finance contracts route failed', context: { error: error instanceof Error ? error.message : String(error) } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });
}
