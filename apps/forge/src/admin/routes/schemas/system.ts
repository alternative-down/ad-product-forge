/**
 * System Admin Schemas - Phase 4 of #719 + #5679
 * Zod schemas for system-level admin POST routes.
 */

import { z } from 'zod';

// =============================================================================
// FACTORY RESET SCHEMA (#5679)
// =============================================================================

/**
 * Body schema for POST /admin/system/reset.
 *
 * Requires explicit `confirm: "FACTORY_RESET"` literal to prevent accidental
 * trigger (e.g., by a frontend bug, double-click, or replay attack). Admin
 * authentication is enforced at the HTTP middleware level via
 * `x-forge-admin-api-key` header (existing pattern), so the body does NOT
 * carry the API key — keeping the body compact and audit-friendly.
 *
 * L#NN-19 hygiene: no env var values are accepted or echoed in the body.
 */
export const factoryResetSchema = z.object({
  confirm: z.literal('FACTORY_RESET'),
});

export type FactoryResetBody = z.infer<typeof factoryResetSchema>;
