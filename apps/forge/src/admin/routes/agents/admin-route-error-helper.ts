import { forgeDebug } from '@forge-runtime/core';
import { errorMsg } from '../../../agents/error-formatting';
import { jsonResponse } from '../helpers';

export type AdminRouteErrorOptions = {
  path?: string;
  label?: string;
};

/**
 * Standard error helper for admin route handlers (regression for #5457).
 *
 * Previously, every route handler in admin/routes/agents/_split/ hand-rolled
 * the same forgeDebug + jsonResponse(500) pattern. This helper centralizes it.
 *
 * Usage:
 *   } catch (err) {
 *     return adminRouteError(err, { path: '/admin/agent/X' });
 *   }
 *
 * - With path: the message becomes {path} route handler failed and
 *   the path is included in the forgeDebug context.
 * - With label: the message becomes Admin {label} failed.
 * - With neither: falls back to the legacy generic message.
 */
export function adminRouteError(error: unknown, opts?: AdminRouteErrorOptions) {
  const path = opts?.path;
  const label = opts?.label;
  const message = path
    ? `${path} route handler failed`
    : label
    ? `Admin ${label} failed`
    : 'Admin route failed';
  forgeDebug({
    scope: 'admin',
    level: 'error',
    message,
    context: { ...(path ? { path } : {}), error: errorMsg(error) },
  });
  return jsonResponse({ error: errorMsg(error) }, 500);
}
