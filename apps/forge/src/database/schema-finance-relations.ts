/**
 * Drizzle relations for schema-finance tables.
 *
 * Extracted from schema.ts in #5337 to colocate table definitions with their relations.
 */
import { relations } from 'drizzle-orm';

import {
  companyCashLedger,
  companyRecurringPayables
} from './schema-finance.js';

export const companyRecurringPayablesRelations = relations(companyRecurringPayables, () => ({}));


export const companyCashLedgerRelations = relations(companyCashLedger, () => ({}));

