/**
 * Route handler utilities for agent write operations.
 * Provides reusable patterns for route registration.
 */

import { parseJsonBody, jsonResponse } from '../../index';
import { forgeDebug } from '../../debug';

export type RouteHandlerDeps = {
  path: string;
  schema: ReturnType<typeof import('zod').z.object>;
  operation: (db: unknown, body: unknown) => Promise<unknown>;
  db: unknown;
};

/**
 * Wraps an operation with try/catch, parseJsonBody, and jsonResponse.
 * Standardizes error handling across all agent write routes.
 */
export function wrapRouteHandler({
  path,
  schema,
  operation,
  db,
}: RouteHandlerDeps) {
  return async (request: { bodyText: string }) => {
    try {
      const body = parseJsonBody(request.bodyText, schema);
      return jsonResponse(await operation(db, body));
    } catch (error) {
      forgeDebug({
        scope: 'admin',
        level: 'error',
        message: `${path} route handler failed`,
        context: {
          path,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  };
}

/**
 * Variant for routes that need custom pre/post logic.
 */
export function wrapCustomRouteHandler(
  path: string,
  customFn: (request: { bodyText: string }) => Promise<ReturnType<typeof jsonResponse>>,
) {
  return async (request: { bodyText: string }) => {
    try {
      return await customFn(request);
    } catch (error) {
      forgeDebug({
        scope: 'admin',
        level: 'error',
        message: `${path} route handler failed`,
        context: {
          path,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  };
}

/**
 * Creates a route handler for ops that take no body (agentId in query/params).
 */
export function wrapNoBodyRouteHandler(
  path: string,
  operation: () => Promise<unknown>,
) {
  return async (_request: unknown) => {
    try {
      return jsonResponse(await operation());
    } catch (error) {
      forgeDebug({
        scope: 'admin',
        level: 'error',
        message: `${path} route handler failed`,
        context: {
          path,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  };
}