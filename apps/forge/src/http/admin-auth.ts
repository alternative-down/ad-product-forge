/**
 * Shared admin API key verification helper (Issue #6528).
 *
 * Replaces duplicated auth logic across:
 *   - apps/forge/src/http/server.ts (path-prefix /admin/* middleware)
 *   - apps/forge/src/admin/routes/system/write.ts (route-level /system/reset)
 *
 * The duplication was identified by Veritas P0 catch on D49 06:43Z (cycle 81
 * PR-A, issue #6526): when /system/reset was re-pathed OUTSIDE /admin/*, the
 * server-level path-prefix auth no longer covered it, and the inline
 * `checkDestructiveRouteAuth()` workaround duplicated server.ts:282-297 logic.
 * This helper closes that architectural smell by extracting the shared logic.
 *
 * 3-tier semantics preserved EXACTLY (matches both prior call sites):
 *
 * | adminApiKey | header | allowInsecureLocal | result |
 * |---|---|---|---|
 * | defined | matches | * | null (authenticated) |
 * | defined | doesn't match | * | `{ status: 401, body: { error: 'Invalid admin API key' } }` |
 * | undefined | * | true | null (warn + authenticated) |
 * | undefined | * | false | `{ status: 503, body: { error: 'Admin authentication not configured...' } }` |
 *
 * Returns null when authenticated; otherwise an error response that the caller
 * is responsible for sending.
 *
 * Pattern reference: L#NN-Helper-Extraction-Path-Update v1 N=1 (D49 cycle 81).
 */

import type { IncomingHttpHeaders } from 'node:http';

export type AdminAuthError = {
  status: 401 | 503;
  body: { error: string };
};

const ADMIN_API_KEY_HEADER = 'x-forge-admin-api-key';

export function verifyAdminApiKey(
  headers: IncomingHttpHeaders,
  adminApiKey: string | undefined,
  allowInsecureLocal: boolean,
): AdminAuthError | null {
  if (adminApiKey === undefined) {
    if (allowInsecureLocal !== true) {
      return {
        status: 503,
        body: {
          error:
            'Admin authentication not configured. Set FORGE_ADMIN_API_KEY to protect admin routes.',
        },
      };
    }
    console.warn(
      '[forge-admin-auth] WARNING: admin route served without authentication.' +
        ' Set FORGE_ADMIN_API_KEY to protect admin routes.',
    );
    return null;
  }

  const headerVal = headers[ADMIN_API_KEY_HEADER];
  const providedKey = Array.isArray(headerVal) ? headerVal[0] : headerVal;
  if (providedKey !== adminApiKey) {
    return { status: 401, body: { error: 'Invalid admin API key' } };
  }
  return null;
}
