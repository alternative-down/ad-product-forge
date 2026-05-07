// fallow-ignore-file unused-file  // #1588/#1589 fragment routes, loaded at runtime

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
