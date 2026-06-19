/**
 * Canonical enum module for company cash ledger direction + status.
 *
 * Single source of truth (L#NN-53 magic-string DRY refactor, issue #5814):
 * - All 5 files (finance/company-cash-ledger, micro-erp/read-model, micro-erp/tools,
 *   forge-admin/src/routes/finance/index.tsx, forge-admin/src/lib/admin-api/finance.ts)
 *   previously defined their own copies of these types/constants inline.
 *
 * Migration:
 * - 47+ hardcoded string literals collapsed into 2 typed const arrays.
 * - 1 unsafe `as` cast in read-model.ts L120 (row.direction as 'in' | 'out')
 *   replaced with `CompanyCashDirection` import + type narrowing helper.
 *
 * ─── Why `as const` arrays instead of plain enums ────────────────────────────
 *
 * TypeScript `enum` produces a runtime object (drift risk: value !== key).
 * A `readonly` const tuple + `typeof X[number]` gives:
 * - Same type safety (`CompanyCashDirection = 'in' | 'out'`)
 * - Same runtime values (`COMPANY_CASH_DIRECTIONS[0] === 'in'`)
 * - Zod compatibility (`z.enum(COMPANY_CASH_DIRECTIONS)` works at runtime)
 * - No `Object.values` import; direct array iteration
 */
export const COMPANY_CASH_DIRECTIONS = ['in', 'out'] as const;
export type CompanyCashDirection = (typeof COMPANY_CASH_DIRECTIONS)[number];

export const COMPANY_CASH_STATUSES = ['planned', 'posted', 'canceled'] as const;
export type CompanyCashStatus = (typeof COMPANY_CASH_STATUSES)[number];

/**
 * Type guard: narrows `string` to `CompanyCashDirection` after runtime validation.
 * Replaces the unsafe `as 'in' | 'out'` cast in micro-erp/read-model.ts L120.
 */
export function isCompanyCashDirection(value: string): value is CompanyCashDirection {
  return (COMPANY_CASH_DIRECTIONS as readonly string[]).includes(value);
}

/**
 * Type guard: narrows `string` to `CompanyCashStatus`.
 */
export function isCompanyCashStatus(value: string): value is CompanyCashStatus {
  return (COMPANY_CASH_STATUSES as readonly string[]).includes(value);
}
