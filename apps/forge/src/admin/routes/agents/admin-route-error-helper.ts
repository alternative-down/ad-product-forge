import { forgeDebug } from '@forge-runtime/core';
import { errorMsg } from '../../../agents/error-formatting';
import { ZodError } from 'zod';
import { jsonResponse } from '../helpers';
import type { HttpHandler } from '../../../http/server';

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
 *
 * Intentionally NOT applicable to:
 * - Loop accumulators (catch in iteration that pushes to results array)
 * - Batch operations (catch in bulk insert/update that needs partial-success semantics)
 * For these, use raw forgeDebug + jsonResponse so the iteration can continue
 * and report per-item results.
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

/**
 * Re-throws ZodError so that schema validation errors bubble up to the outer
 * HTTP layer with their intended status code. Used by safeRoute and
 * labeledRoute to preserve the pre-extraction behavior of sites that
 * previously had inline `if (err instanceof ZodError) throw err;` guards.
 */
function isZodErrorToRethrow(err: unknown): boolean {
  return err instanceof ZodError;
}

/**
 * Higher-order route handler wrapper that consolidates the
 * try { ... } catch (err) { return adminRouteError(err, { path }); }
 * pattern across admin route registrations (regression for #6262).
 *
 * Two overloads:
 *   safeRoute(path, handler)  - for sites that already use { path: '...' }
 *   safeRoute(handler)        - for sites that used bare adminRouteError(err)
 *
 * Both re-throw ZodError so validation errors propagate to the outer layer
 * with their intended 4xx status code.
 *
 * Usage:
 *   httpServer.registerRoute({
 *     method: 'POST',
 *     path: '/admin/...',
 *     handler: safeRoute('/admin/...', async (request) => {
 *       return jsonResponse(result);
 *     }),
 *   });
 *
 * Benefits:
 *   - Removes the boilerplate try/catch from each handler
 *   - Guarantees the path is captured at registration time (no typo drift)
 *   - Compatible with the existing Format A tripwire (adminRouteError still
 *     handles the error path)
 *
 * Codification: L#NN-safe-Route PROMOTION at N=17 admin route files, ~84 call sites.
 *   DRAFTED at N=1 in PR #6261; promoted at #6262 (D38 cycle 1).
 */
export function safeRoute(handler: HttpHandler): HttpHandler;
export function safeRoute(path: string, handler: HttpHandler): HttpHandler;
export function safeRoute(
  pathOrHandler: string | HttpHandler,
  handler?: HttpHandler,
): HttpHandler {
  const isPath = typeof pathOrHandler === 'string';
  const actualHandler = (isPath ? handler : pathOrHandler) as HttpHandler;
  const path = isPath ? pathOrHandler : undefined;
  return async (request) => {
    try {
      return await actualHandler(request);
    } catch (err) {
      if (isZodErrorToRethrow(err)) throw err;
      return adminRouteError(err, path !== undefined ? { path } : undefined);
    }
  };
}

/**
 * Higher-order route handler wrapper for sites that use a human-readable
 * label (instead of a path) in adminRouteError. Re-throws ZodError so that
 * schema validation errors bubble up to the outer HTTP layer with their
 * intended status code (preserves pre-extraction behavior).
 *
 * Usage:
 *   handler: labeledRoute('Agent list route', async (request) => {
 *     return jsonResponse(await readModel.listAgents());
 *   }),
 *
 * Regression for #6262 phase 2. Codification: L#NN-safe-Route PROMOTION
 * label sub-pattern, N=15 sites across 4 files.
 */
export function labeledRoute(label: string, handler: HttpHandler): HttpHandler {
  return async (request) => {
    try {
      return await handler(request);
    } catch (err) {
      if (isZodErrorToRethrow(err)) throw err;
      return adminRouteError(err, { label });
    }
  };
}