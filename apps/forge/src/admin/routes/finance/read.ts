/**
 * Finance Admin Read Routes - Extracted from routes.ts
 * GET routes for finance overview and contracts
 */

import { z as _z } from 'zod';
import type { HttpHandler } from '../../../http/server';
import type { Database } from '../../../database/index';
import { jsonResponse } from '../index';
import { adminRouteError } from '../agents/admin-route-error-helper';

type CompanyCash = {
  getOverview: () => Promise<unknown>;
  listContractSummaries: () => Promise<unknown>;
};

type FinanceReadInput = {
  companyCash: CompanyCash;
};

/**
 * Register GET routes for finance read operations
 */
export function registerFinanceReadRoutes(
  httpServer: {
    registerRoute: (route: {
      method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
      path: string;
      handler: HttpHandler;
    }) => void;
  },
  db: Database,
  finance?: FinanceReadInput,
) {
  // GET /admin/finance
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/finance',
    handler: async () => {
      try {
        return jsonResponse(await finance?.companyCash.getOverview());
      } catch (err) {
        return adminRouteError(err, { label: 'Finance overview route' });
      }
    },
  });

  // GET /admin/finance/contracts
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/finance/contracts',
    handler: async () => {
      try {
        return jsonResponse(await finance?.companyCash.listContractSummaries());
      } catch (err) {
        return adminRouteError(err, { label: 'Finance contracts route' });
      }
    },
  });
}
