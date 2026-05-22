import {
  integer,
  real,
  sqliteTable,
  text,
  index,
} from 'drizzle-orm/sqlite-core';
import { InferModel } from 'drizzle-orm';

export const companyCashLedger = sqliteTable(
  'company_cash_ledger',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    direction: text('direction').notNull(),
    amountUsd: real('amount_usd').notNull(),
    description: text('description'),
    referenceType: text('reference_type'),
    referenceId: text('reference_id'),
    status: text('status').notNull(),
    dueAt: integer('due_at'),
    effectiveAt: integer('effective_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    companyCashLedgerStatusIdx: index('company_cash_ledger_status_idx').on(table.status),
    companyCashLedgerEffectiveAtIdx: index('company_cash_ledger_effective_at_idx').on(
      table.effectiveAt,
    ),
    companyCashLedgerUpdatedAtIdx: index('company_cash_ledger_updated_at_idx').on(table.updatedAt),
  }),
);

export type CompanyCashLedgerEntry = InferModel<typeof companyCashLedger>;
export type NewCompanyCashLedgerEntry = InferModel<typeof companyCashLedger, 'insert'>;

export const companyRecurringPayables = sqliteTable(
  'company_recurring_payables',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    amountUsd: real('amount_usd').notNull(),
    recurrencePeriod: text('recurrence_period').notNull(),
    nextDueAt: integer('next_due_at').notNull(),
    isActive: integer('is_active').notNull().default(1),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    companyRecurringPayablesIsActiveIdx: index('company_recurring_payables_is_active_idx').on(
      table.isActive,
    ),
    companyRecurringPayablesNextDueAtIdx: index('company_recurring_payables_next_due_at_idx').on(
      table.nextDueAt,
    ),
  }),
);

export type CompanyRecurringPayable = InferModel<typeof companyRecurringPayables>;
export type NewCompanyRecurringPayable = InferModel<typeof companyRecurringPayables, 'insert'>;