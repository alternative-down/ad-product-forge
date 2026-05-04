import http, { type IncomingHttpHeaders } from 'node:http';
import { forgeDebug } from '@forge-runtime/core';
import { ZodError } from 'zod';

export const DEFAULT_MAX_BODY_BYTES = 1 * 1024 * 1024; // 1 MB
export const MAX_BODY_BYTES = parseInt(process.env.FORGE_HTTP_MAX_BODY_BYTES ?? '', 10) || DEFAULT_MAX_BODY_BYTES;

type BodyResult =
  | { isRejected: true }
  | { isRejected: false; buffer: Buffer };

export type HttpRequest = {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: IncomingHttpHeaders;
  body: Buffer;
  bodyText: string;
};

export type HttpResponse = {
  status: number;
  headers?: Record<string, string>;
  body?: string | Buffer;
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
  if (allowedOrigins && origin && allowedOrigins.has(origin)) {
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
};

export function createForgeHttpServer(config: CreateForgeHttpServerConfig) {
  const allowedOrigins = config.allowedOrigins?.length
    ? new Set(config.allowedOrigins)
    : null;
  const limit = config.maxBodyBytes ?? MAX_BODY_BYTES;
  const routes = new Map<RouteKey, HttpHandler>();
  const server = http.createServer(async (req, res) => {
    if (!req.url || !req.method) {
      const origin = getHeaderValue(req.headers['origin'])
        ?? getHeaderValue(req.headers['host']);
      res.writeHead(400, buildCorsHeaders(origin ?? null, allowedOrigins)).end('Missing request data');
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
      if (!config.adminApiKey) {
        if (config.allowInsecureLocal) {
          // eslint-disable-next-line no-console
          console.warn(
            '[forge-http] WARNING: /admin/* served without authentication.'
            + ' Set FORGE_ADMIN_API_KEY to protect admin routes.',
          );
        } else {
          res.writeHead(503, {
            ...corsHeaders,
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
          });
          res.end(JSON.stringify({
            error: 'Admin authentication not configured. Set FORGE_ADMIN_API_KEY to protect admin routes.',
          }));
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

    const bodyResult = await readBodyWithLimit(req, limit);

    if (bodyResult.isRejected) {
      res.writeHead(413, {
        ...corsHeaders,
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      });
      res.end(JSON.stringify({ error: 'Request body too large' }));
      return;
    }

    try {
      const response = await handler({
        method: req.method.toUpperCase(),
        path: url.pathname,
        query: url.searchParams,
        headers: req.headers,
        body: bodyResult.buffer,
        bodyText: bodyResult.buffer.toString('utf8'),
      });

      res.writeHead(response.status, {
        ...corsHeaders,
        ...(response.headers ?? {}),
      });
      res.end(response.body);
    } catch (error) {
      if (error instanceof ZodError) {
        res.writeHead(400, {
          ...corsHeaders,
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        });
        res.end(
          JSON.stringify({
            error: 'Invalid request',
            details: error.flatten(),
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
          error: error instanceof Error ? error.message : String(error),
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
      server.once('error', reject);
      server.listen(config.port, () => {
        server.off('error', reject);
        resolve();
      });
    });
    // Override port getter to return the actual assigned port
    // (especially when config.port was 0, causing OS to pick a random free port)
    const addr = server.address();
    if (addr && typeof addr === 'object') {
      // Re-expose the actual port on the returned object
      (server as any)._actualPort = addr.port;
    }
  }

  let actualPort = config.port;

  async function start() {
    await new Promise<void>((resolve, reject) => {
      server.on('error', reject);
      server.listen(config.port, () => {
        server.off('error', reject);
        actualPort = (server.address() as { port: number }).port;
        resolve();
      });
    });
  }

  async function stop() {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  return {
    registerRoute,
    start,
    stop,
    get port() {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        return addr.port;
      }
      return config.port;
    },
  };
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
        // Stop pushing chunks but do NOT destroy — destroying the socket
        // causes ECONNRESET before the 413 response can be written.
        // Removing the data listener is sufficient to stop collection.
        request.removeAllListeners('data');
        request.removeAllListeners('end');
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