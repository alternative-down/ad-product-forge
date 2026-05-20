/**
 * Internal Chat Route Helpers — Phase 1 of #2744
 * Extracted error handling and request parsing utilities.
 */

import type { HttpHandler } from '../../../http/server';
import { z } from 'zod';
import { forgeDebug } from '../debug';
import { jsonResponse, parseJsonBody } from '../index';

// ─── Request type ─────────────────────────────────────────────────────────────

export interface InternalChatRequest {
  query: Map<string, string>;
  bodyText: string;
}

// ─── Error handling ────────────────────────────────────────────────────────────

/**
 * Wraps an HTTP handler with consistent error handling.
 * Logs via forgeDebug and returns a 500 JSON response on failure.
 */
export function withRouteErrorHandler<Args extends unknown[]>(
  scope: string,
  path: string,
  handler: (...args: Args) => ReturnType<HttpHandler>,
): (...args: Args) => ReturnType<HttpHandler> {
  return (...args: Args) => {
    try {
      return handler(...args);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      forgeDebug({
        scope,
        level: 'error',
        message: `Admin route failed: ${path}`,
        context: { error },
      });
      return jsonResponse({ error }, 500);
    }
  };
}

// ─── Request parsing ──────────────────────────────────────────────────────────

/**
 * Extracts a query parameter from the request.
 * Returns null if the parameter is missing or empty.
 */
export function getQueryParam(request: InternalChatRequest, key: string): string | null {
  const value = request.query.get(key);
  return value !== null && value !== undefined && value.length > 0 ? value : null;
}

/**
 * Asserts a required query parameter. Throws if missing.
 */
export function requireQueryParam(request: InternalChatRequest, key: string): string {
  const value = getQueryParam(request, key);
  if (value === null || value === undefined) {
    throw new Error(`${key} required`);
  }
  return value;
}

/**
 * Parses and validates the request body against a Zod schema.
 * Re-throws Zod errors as generic Error so the route error handler catches them.
 */
export function parseBody<T extends z.ZodTypeAny>(
  request: InternalChatRequest,
  schema: T,
): z.infer<T> {
  try {
    return parseJsonBody(request.bodyText, schema);
  } catch (err) {
    // Re-throw as plain Error so withRouteErrorHandler can catch it
    throw new Error(err instanceof Error ? err.message : 'Invalid request body');
  }
}

// ─── Route builder helpers ────────────────────────────────────────────────────

export type RouteOptions = {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  handler: HttpHandler;
};

/**
 * Registers a route with error handling applied to the handler.
 */
export function registerRoute(
  httpServer: { registerRoute: (route: RouteOptions) => void },
  options: RouteOptions,
): void {
  const wrapped = withRouteErrorHandler('admin', options.path, options.handler);
  httpServer.registerRoute({ ...options, handler: wrapped });
}
