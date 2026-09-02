import http, { type IncomingHttpHeaders } from 'node:http';
import { Readable } from 'node:stream';
import { forgeDebug } from '@forge-runtime/core';
import { ZodError } from "zod";
import { ADMIN_API_KEY_HEADER, verifyAdminApiKey } from './admin-auth';
import { parseEnv } from '../config/env';

const MAX_BODY_BYTES = parseEnv().FORGE_HTTP_MAX_BODY_BYTES;

type BodyResult = { isRejected: true } | { isRejected: false; buffer: Buffer };

export type HttpRequest = {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: IncomingHttpHeaders;
  body: Buffer;
  bodyText: string;
  /** The raw Node.js incoming message. Handlers can attach 'close' listeners
   *  to detect when the client drops the connection (e.g. SSE client gone). */
  req: http.IncomingMessage;
};

export type HttpResponse = {
  status: number;
  headers?: Record<string, string>;
  body?: string | Buffer;
  /** When set, the response is a streaming body (e.g. SSE). The server writes
   *  HTTP headers immediately and pipes the Readable to the socket. The caller
   *  is responsible for setting appropriate Content-Type headers (e.g.
   *  'text/event-stream') in `headers`. */
  stream?: Readable;
};

export type HttpHandler = (request: HttpRequest) => Promise<HttpResponse> | HttpResponse;

type RouteKey = `${string} ${string}`;

/**
 * Builds a RouteKey from an HTTP method and URL path.
 *
 * The `as RouteKey` cast is centralized here at the boundary between a
 * template-string concatenation and the constrained `RouteKey` template
 * literal type (L#NN-50 #18 v2 cast-CENTRALIZATION). All internal callers
 * receive typed `RouteKey` values; no other site needs to cast.
 */
export function buildRouteKey(method: string, path: string): RouteKey {
  return `${method} ${path}` as RouteKey;
}

const CORS_METHODS = 'GET,POST,PATCH,DELETE,OPTIONS';
const CORS_ALLOWED_HEADERS = `content-type,${ADMIN_API_KEY_HEADER}`;

function buildCorsHeaders(
  origin: string | null,
  allowedOrigins: Set<string> | null,
): Record<string, string> {
  // When allowed-origins is configured, restrict CORS to those origins only.
  if (allowedOrigins != null && origin != null && allowedOrigins.has(origin)) {
    return {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': CORS_METHODS,
      'access-control-allow-headers': CORS_ALLOWED_HEADERS,
    };
  }

  // Fall back to permissive CORS for public routes / unknown origins.
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': CORS_METHODS,
    'access-control-allow-headers': CORS_ALLOWED_HEADERS,
  };
}
import { errorMsg } from '../agents/error-formatting';
type ErrorResponseBody = { error: string; details?: unknown };

/**
 * Writes a JSON error response with consistent headers (content-type,
 * cache-control: no-store). All error sites in the request handler must
 * funnel through this helper so the response shape is uniform.
 */
function sendError(
  res: http.ServerResponse,
  corsHeaders: Record<string, string>,
  status: number,
  body: ErrorResponseBody,
  extraHeaders: Record<string, string> = {},
): void {
  res.writeHead(status, {
    ...corsHeaders,
    ...extraHeaders,
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-forge-version': getVersionHeader(),
  });
  res.end(JSON.stringify(body));
}

/**
 * Returns the version header value for x-forge-version. Reads from
 * FORGE_GIT_SHA env var (set at deploy time) and falls back to "local-dev".
 * This enables deploy verification from outside without SSH access.
 * See L#NN-Deploy-Verification-No-SSH v1.
 */
function getVersionHeader(): string {
  return parseEnv().FORGE_GIT_SHA;
}
export type CreateForgeHttpServerConfig = {
  port: number;
  /** Admin API key. When absent and allowInsecureLocal is false, /admin/* routes
   *  return HTTP 503. */
  adminApiKey?: string;
  /** When true, /admin/* routes are served without authentication (local dev only).
   *  Do NOT set in production. */
  allowInsecureLocal?: boolean;
  /** Explicit list of allowed CORS origins for admin routes. When set, only these
   *  origins receive access-control-allow-origin on admin responses. */
  allowedOrigins?: string[];
  /** Maximum request body size in bytes. Defaults to FORGE_HTTP_MAX_BODY_BYTES env var
   *  or 1 MB when not set. */
  maxBodyBytes?: number;
  /** Rate limit configuration for the sliding window.
   *  When set, requests beyond the limit return 429 Too Many Requests with
   *  Retry-After + X-RateLimit-* headers. Defaults to { windowMs: 60_000, max: 120 }. */
  rateLimit?: {
    /** Sliding window duration in milliseconds. Default 60_000 (1 minute). */
    windowMs?: number;
    /** Maximum requests per window. Default 120. */
    max?: number;
  };
};

export interface ForgeHttpServer {
  registerRoute: (input: {
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    path: string;
    handler: HttpHandler;
  }) => () => void;
  start: () => Promise<void>;
  stop: (options?: { forceTimeoutMs?: number }) => Promise<void>;
  readonly port: number;
}

/**
 * Thenable intersection — returned by createForgeHttpServer so callers can
 * either await for the resolved ForgeHttpServer OR access properties
 * directly (port, registerRoute) without await. Satisfies the
 * 'Promise<ForgeHttpServer> & ForgeHttpServer' return type natively
 * via the 'then' method, removing the prior 'as unknown as' cast.
 */
export type ForgeHttpServerThenable = ForgeHttpServer & Promise<ForgeHttpServer>;

/** Adapters that accept ForgeHttpServer as httpServer argument.
 *  Used by admin route modules that don't need start/stop/port. */
export type ForgeHttpServerAdapter = Pick<ForgeHttpServer, 'registerRoute'>;

export function createForgeHttpServer(
  config: CreateForgeHttpServerConfig,
): ForgeHttpServerThenable {
  const allowedOrigins =
    config.allowedOrigins !== null &&
    config.allowedOrigins !== undefined &&
    config.allowedOrigins.length
      ? new Set(config.allowedOrigins)
      : null;
  const limit = config.maxBodyBytes ?? MAX_BODY_BYTES;
  const routes = new Map<RouteKey, HttpHandler>();
  let started = false;

  // ── Rate Limit Tracking ──────────────────────────────────────────────────
  // Sliding window: tracks request timestamps within the current window.
  // Configurable via config.rateLimit; defaults preserve the original constants
  // so existing clients see no behavior change.
  const RATE_WINDOW_MS = config.rateLimit?.windowMs ?? 60_000; // 1-minute window
  const RATE_MAX = config.rateLimit?.max ?? 120; // requests per window
  const requestTimestamps: number[] = [];

  // Prune timestamps older than the window. Idempotent and safe to call from
  // any handler. Used by both getRateLimitHeaders() and the rate-limit check
  // below so cleanup runs even when no successful response is written (e.g.,
  // dropped connections, errors that throw before writeHead).
  function pruneExpiredTimestamps() {
    const cutoff = Date.now() - RATE_WINDOW_MS;
    while (requestTimestamps.length > 0 && requestTimestamps[0] < cutoff) {
      requestTimestamps.shift();
    }
  }

  function getRateLimitHeaders(): Record<string, string> {
    pruneExpiredTimestamps();
    const remaining = Math.max(0, RATE_MAX - requestTimestamps.length);
    const resetMs = Date.now() + RATE_WINDOW_MS;
    return {
      'X-RateLimit-Limit': String(RATE_MAX),
      'X-RateLimit-Remaining': String(remaining),
      'X-RateLimit-Reset': String(Math.ceil(resetMs / 1000)),
    };
  }

  // Returns true when the sliding window is at capacity. Callers should
  // return 429 if true. We don't mutate the timestamp list here — the caller
  // is responsible for tracking via requestTimestamps.push() on success.
  function isRateLimited(): boolean {
    pruneExpiredTimestamps();
    return requestTimestamps.length >= RATE_MAX;
  }
  const server = http.createServer(async (req, res) => {
    if (req.url === undefined || req.method === undefined) {
      const origin = getHeaderValue(req.headers['origin']) ?? getHeaderValue(req.headers['host']);
      sendError(
        res,
        buildCorsHeaders(origin ?? null, allowedOrigins),
        400,
        { error: 'Missing request data' },
      );
      return;
      return;
    }

    const url = new URL(req.url, `http://127.0.0.1:${config.port}`);
    const origin = getHeaderValue(req.headers['origin']) ?? null;
    const corsHeaders = buildCorsHeaders(origin, allowedOrigins);

    if (req.method.toUpperCase() === 'OPTIONS') {
      res.writeHead(204, { ...corsHeaders, 'x-forge-version': getVersionHeader() });
      res.end();
      return;
    }

    // Public health endpoints for orchestrator probes (Coolify default /healthz,
    // K8s default /healthcheck, generic /health). All run BEFORE auth middleware
    // so the proxy can verify container health without credentials.
    // See L#NN-Healthcheck-Aliases-Defensive v1.
    if (
      (url.pathname === '/healthz' || url.pathname === '/health' || url.pathname === '/healthcheck') &&
      req.method.toUpperCase() === 'GET'
    ) {
      res.writeHead(200, {
        ...corsHeaders,
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-forge-version': getVersionHeader(),
      });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    // Public version endpoint for deploy verification without SSH.
    // Returns commit SHA + deploy time. See L#NN-Deploy-Verification-No-SSH v1.
    if (url.pathname === '/version' && req.method.toUpperCase() === 'GET') {
      res.writeHead(200, {
        ...corsHeaders,
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-forge-version': getVersionHeader(),
      });
      res.end(
        JSON.stringify({
          sha: parseEnv().FORGE_GIT_SHA,
          deployTime: parseEnv().FORGE_DEPLOY_TIME,
          container: 'forge',
        }),
      );
      return;
    }

    const key = buildRouteKey(req.method.toUpperCase(), url.pathname);
    const handler = routes.get(key);

    if (!handler) {
      sendError(res, corsHeaders, 404, { error: 'Not found' });
      return;
    }

    // Authenticate /admin/* routes via shared verifyAdminApiKey helper (#6528)
    if (url.pathname.startsWith('/admin/')) {
      const denied = verifyAdminApiKey(
        req.headers,
        config.adminApiKey,
        config.allowInsecureLocal === true,
      );
      if (denied !== null) {
        sendError(res, corsHeaders, denied.status, denied.body);
        return;
      }
    }

    // Rate limit check happens BEFORE body read so rate-limited requests
    // do not waste CPU/memory reading their body. The check uses the same
    // sliding window as getRateLimitHeaders() and prunes expired entries.
    if (isRateLimited()) {
      const rateLimitHeaders = getRateLimitHeaders();
      sendError(
        res,
        corsHeaders,
        429,
        { error: 'Too many requests' },
        {
          ...rateLimitHeaders,
          'retry-after': String(Math.ceil(RATE_WINDOW_MS / 1000)),
        },
      );
      return;
    }

    const bodyResult = await readBodyWithLimit(req, limit);

    if (bodyResult.isRejected) {
      const rateLimitHeaders = getRateLimitHeaders();
      sendError(
        res,
        corsHeaders,
        413,
        { error: 'Request body too large' },
        rateLimitHeaders,
      );
      return;
    }

    // Track request for rate limiting (after body read succeeds, before
    // handler executes). Rate-limited requests that returned 429 above do
    // not push here — we only track requests that consumed handler time.
    requestTimestamps.push(Date.now());

    try {
      const response = await handler({
        method: req.method.toUpperCase(),
        path: url.pathname,
        query: url.searchParams,
        headers: req.headers,
        body: bodyResult.buffer,
        bodyText: bodyResult.buffer.toString('utf8'),
        req,
      });

      // Streaming response — write headers and pipe the body stream
      if (response.stream) {
        const rateLimitHeaders = getRateLimitHeaders();
        res.writeHead(response.status, {
          ...corsHeaders,
          ...rateLimitHeaders,
          ...(response.headers ?? {}),
          'x-forge-version': getVersionHeader(),
          // Disable buffering so chunks go straight to the client
          'x-accel-buffering': 'no',
        });
        response.stream.pipe(res);
        return;
      }

      const rateLimitHeaders = getRateLimitHeaders();
      res.writeHead(response.status, {
        ...corsHeaders,
        ...rateLimitHeaders,
        ...(response.headers ?? {}),
        'x-forge-version': getVersionHeader(),
      });
      res.end(response.body);
    } catch (error) {
      if (error instanceof ZodError) {
        const rateLimitHeaders = getRateLimitHeaders();
        sendError(
          res,
          corsHeaders,
          400,
          {
            error: 'Invalid request',
            details: error.flatten(),
          },
          rateLimitHeaders,
        );
        return;
      }

      forgeDebug({
        scope: 'http-server',
        level: 'error',
        message: 'HTTP request failed',
        context: { method: req.method, pathname: url.pathname, error },
      });
      sendError(res, corsHeaders, 500, { error: errorMsg(error) });
    }
  });

  function registerRoute(input: {
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    path: string;
    handler: HttpHandler;
  }) {
    const key = buildRouteKey(input.method, input.path);
    routes.set(key, input.handler);

    return () => {
      routes.delete(key);
    };
  }

  async function start() {
    if (started) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      server.on('error', reject);
      server.listen(config.port, () => {
        server.off('error', reject);
        started = true;
        resolve();
      });
    });
  }

  async function stop(options: { forceTimeoutMs?: number } = {}): Promise<void> {
    if (!started) {
      return;
    }

    const forceTimeoutMs = options.forceTimeoutMs ?? 10_000;

    // Force-close all existing connections after timeout (graceful shutdown
    // with a hard ceiling). server.close() waits for active connections to
    // drain naturally, which can hang indefinitely if a handler is slow or
    // a client keeps an SSE connection open. The timer + closeAllConnections
    // pattern is the canonical fix (Node 18.2+, forge targets node22).
    const forceTimer = setTimeout(() => {
      forgeDebug({
        scope: 'http-server',
        level: 'warn',
        message: 'Graceful shutdown timeout, force-closing connections',
      });
      server.closeAllConnections?.();
    }, forceTimeoutMs);
    forceTimer.unref();

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        clearTimeout(forceTimer);
        if (error) reject(error);
        else resolve();
      });
    });
    started = false;
  }

  const forgeServer: ForgeHttpServer = {
    registerRoute,
    start,
    stop,
    get port() {
      const addr = server.address();
      if (addr !== null && addr !== undefined && typeof addr === 'object') {
        return addr.port;
      }
      return config.port;
    },
  };

  // ForgeHttpServerThenable = ForgeHttpServer & Promise<ForgeHttpServer>.
  // Native intersection via 'then' method — no cast needed.
  // Build a native Promise<ForgeHttpServer> thenable object — satisfies
  // the ForgeHttpServerThenable intersection (ForgeHttpServer & Promise<...>)
  // without 'as unknown as' cast. catch/finally/Symbol.toStringTag delegated
  // to the underlying resolved Promise.
  return Object.assign(forgeServer, {
    then<TResult1 = ForgeHttpServer, TResult2 = never>(
      onfulfilled?: ((value: ForgeHttpServer) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
      return Promise.resolve(forgeServer).then(onfulfilled, onrejected);
    },
    catch<TResult = never>(
      onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
    ): Promise<ForgeHttpServer | TResult> {
      return Promise.resolve(forgeServer).catch(onrejected);
    },
    finally(onfinally?: (() => void) | null): Promise<ForgeHttpServer> {
      return Promise.resolve(forgeServer).finally(onfinally);
    },
    [Symbol.toStringTag]: 'Promise' as const,
  });
}

function getHeaderValue(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value[0];
  }

  return undefined;
}

function readBodyWithLimit(request: http.IncomingMessage, limit: number): Promise<BodyResult> {
  return new Promise<BodyResult>((resolve) => {
    const chunks: Buffer[] = [];
    let bytesReceived = 0;

    request.on('data', (chunk) => {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      bytesReceived += buf.byteLength;

      if (bytesReceived > limit) {
        // Stop our handlers; pause the stream so Node stops buffering
        // chunks internally (otherwise the OS socket keeps receiving
        // and Node allocates memory for unread bytes — see #5448).
        // The destroy is scheduled via setImmediate so the caller has
        // a chance to write the 413 response in the same tick.
        request.removeAllListeners('data');
        request.removeAllListeners('end');
        request.pause();
        setImmediate(() => request.destroy());
        resolve({ isRejected: true });
        return;
      }

      chunks.push(buf);
    });

    request.on('end', () => {
      resolve({ isRejected: false, buffer: Buffer.concat(chunks) });
    });

    request.on('error', () => {
      resolve({ isRejected: true });
    });
  });
}
