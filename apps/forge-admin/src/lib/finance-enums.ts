/**
 * Re-export of canonical company-cash enums for forge-admin consumption.
 *
 * Canonical source: apps/forge/src/finance/company-cash-enums.ts
 * (L#NN-53 magic-string DRY refactor, issue #5814)
 *
 * forge-admin can't import directly from apps/forge/src/ due to workspace
 * isolation, so we re-export from the forge-admin lib layer.
 */
export {
  COMPANY_CASH_DIRECTIONS,
  COMPANY_CASH_STATUSES,
  type CompanyCashDirection,
  type CompanyCashStatus,
} from '../../../forge/src/finance/company-cash-enums';
