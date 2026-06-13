import http, { type IncomingHttpHeaders } from 'node:http';
import { Readable } from 'node:stream';
import { forgeDebug } from '@forge-runtime/core';
import { ZodError, z } from 'zod';

const DEFAULT_MAX_BODY_BYTES = 1 * 1024 * 1024; // 1 MB
const MAX_BODY_BYTES =
  parseInt(process.env.FORGE_HTTP_MAX_BODY_BYTES ?? '', 10) || DEFAULT_MAX_BODY_BYTES;

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

const CORS_METHODS = 'GET,POST,PATCH,DELETE,OPTIONS';
const CORS_ALLOWED_HEADERS = 'content-type,x-forge-admin-api-key';
const ADMIN_API_KEY_HEADER = 'x-forge-admin-api-key';

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
  stop: () => Promise<void>;
  readonly port: number;
}

/** Adapters that accept ForgeHttpServer as httpServer argument.
 *  Used by admin route modules that don't need start/stop/port. */
export type ForgeHttpServerAdapter = Pick<ForgeHttpServer, 'registerRoute'>;

export function createForgeHttpServer(
  config: CreateForgeHttpServerConfig,
): Promise<ForgeHttpServer> & ForgeHttpServer {
  const allowedOrigins =
    config.allowedOrigins !== null &&
    config.allowedOrigins !== undefined &&
    config.allowedOrigins.length
      ? new Set(config.allowedOrigins)
      : null;
  const limit = config.maxBodyBytes ?? MAX_BODY_BYTES;
  const routes = new Map<RouteKey, HttpHandler>();

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
      res
        .writeHead(400, buildCorsHeaders(origin ?? null, allowedOrigins))
        .end('Missing request data');
      return;
    }

    const url = new URL(req.url, `http://127.0.0.1:${config.port}`);
    const origin = getHeaderValue(req.headers['origin']) ?? null;
    const corsHeaders = buildCorsHeaders(origin, allowedOrigins);

    if (req.method.toUpperCase() === 'OPTIONS') {
      res.writeHead(204, corsHeaders);
      res.end();
      return;
    }

    const key = `${req.method.toUpperCase()} ${url.pathname}` as RouteKey;
    const handler = routes.get(key);

    if (!handler) {
      res.writeHead(404, { ...corsHeaders, 'content-type': 'text/plain' }).end('Not found');
      return;
    }

    // Authenticate /admin/* routes
    if (url.pathname.startsWith('/admin/')) {
      if (config.adminApiKey === undefined) {
        if (config.allowInsecureLocal === true) {
          console.warn(
            '[forge-http] WARNING: /admin/* served without authentication.' +
              ' Set FORGE_ADMIN_API_KEY to protect admin routes.',
          );
        } else {
          res.writeHead(503, {
            ...corsHeaders,
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
          });
          res.end(
            JSON.stringify({
              error:
                'Admin authentication not configured. Set FORGE_ADMIN_API_KEY to protect admin routes.',
            }),
          );
          return;
        }
      } else {
        const providedKey = getHeaderValue(req.headers[ADMIN_API_KEY_HEADER]);

        if (providedKey !== config.adminApiKey) {
          res.writeHead(401, {
            ...corsHeaders,
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
          });
          res.end(JSON.stringify({ error: 'Invalid admin API key' }));
          return;
        }
      }
    }

    // Rate limit check happens BEFORE body read so rate-limited requests
    // do not waste CPU/memory reading their body. The check uses the same
    // sliding window as getRateLimitHeaders() and prunes expired entries.
    if (isRateLimited()) {
      const rateLimitHeaders = getRateLimitHeaders();
      res.writeHead(429, {
        ...corsHeaders,
        ...rateLimitHeaders,
        'retry-after': String(Math.ceil(RATE_WINDOW_MS / 1000)),
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      });
      res.end(JSON.stringify({ error: 'Too many requests' }));
      return;
    }

    const bodyResult = await readBodyWithLimit(req, limit);

    if (bodyResult.isRejected) {
      const rateLimitHeaders = getRateLimitHeaders();
      res.writeHead(413, {
        ...corsHeaders,
        ...rateLimitHeaders,
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      });
      res.end(JSON.stringify({ error: 'Request body too large' }));
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
      });
      res.end(response.body);
    } catch (error) {
      if (error instanceof ZodError) {
        const rateLimitHeaders = getRateLimitHeaders();
        res.writeHead(400, {
          ...corsHeaders,
          ...rateLimitHeaders,
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        });
        res.end(
          JSON.stringify({
            error: 'Invalid request',
            details: z.flattenError(error),
          }),
        );
        return;
      }

      forgeDebug({
        scope: 'http-server',
        level: 'error',
        message: 'HTTP request failed',
        context: { method: req.method, pathname: url.pathname, error },
      });
      res.writeHead(500, {
        ...corsHeaders,
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      });
      res.end(
        JSON.stringify({
          error: errorMsg(error),
        }),
      );
    }
  });

  function registerRoute(input: {
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    path: string;
    handler: HttpHandler;
  }) {
    const key = `${input.method} ${input.path}` as RouteKey;
    routes.set(key, input.handler);

    return () => {
      routes.delete(key);
    };
  }

  async function start() {
    await new Promise<void>((resolve, reject) => {
      server.on('error', reject);
      server.listen(config.port, () => {
        server.off('error', reject);
        resolve();
      });
    });
  }

  async function stop(options: { forceTimeoutMs?: number } = {}): Promise<void> {
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
  }

  return {
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
  } as unknown as Promise<ForgeHttpServer> & ForgeHttpServer;
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
