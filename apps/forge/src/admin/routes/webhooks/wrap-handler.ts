import { ZodError } from 'zod';
import type { HttpRequest, HttpResponse } from '../../../http/server';
import { errorMsg } from '../../../agents/error-formatting';
import { forgeDebug } from '../debug';
import { jsonResponse } from '../index';

export type AdminHandler = (req: HttpRequest) => Promise<HttpResponse>;

/**
 * Wrap an admin route handler with consistent error logging and response.
 *
 * - Logs every caught error via forgeDebug with `scope: 'admin'`
 * - Maps ZodError to 400 (validation_failed + issues)
 * - Maps everything else to 500 (error message)
 *
 * Usage:
 *   httpServer.registerRoute({
 *     method: 'POST',
 *     path: '/admin/webhooks/route/create',
 *     handler: wrapAdminRoute('/admin/webhooks/route/create', async (request) => {
 *       const body = parseJsonBody(request.bodyText, createRouteSchema);
 *       const route = await store.createRoute({ ... });
 *       return jsonResponse({ routeId: route.routeId }, 201);
 *     }),
 *   });
 */
export function wrapAdminRoute(routePath: string, handler: AdminHandler): AdminHandler {
  return async (request: HttpRequest) => {
    try {
      return await handler(request);
    } catch (err) {
      const error = errorMsg(err);
      forgeDebug({
        scope: 'admin',
        level: 'error',
        message: `Admin route failed: ${routePath}`,
        context: { error },
      });
      if (err instanceof ZodError) {
        return jsonResponse({ error: 'validation_failed', details: err.issues }, 400);
      }
      return jsonResponse({ error }, 500);
    }
  };
}
