import http, { type IncomingHttpHeaders } from 'node:http';
import { forgeDebug } from '@forge-runtime/core';
import { ZodError } from 'zod';

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

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'access-control-allow-headers': 'content-type,x-forge-admin-api-key',
};

const ADMIN_API_KEY_HEADER = 'x-forge-admin-api-key';

export function createForgeHttpServer(config: { port: number; adminApiKey?: string }) {
  const routes = new Map<RouteKey, HttpHandler>();
  const server = http.createServer(async (req, res) => {
    if (!req.url || !req.method) {
      res.writeHead(400, CORS_HEADERS).end('Missing request data');
      return;
    }

    const url = new URL(req.url, `http://127.0.0.1:${config.port}`);

    if (req.method.toUpperCase() === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    const key = `${req.method.toUpperCase()} ${url.pathname}` as RouteKey;
    const handler = routes.get(key);

    if (!handler) {
      res.writeHead(404, CORS_HEADERS).end('Not found');
      return;
    }

    if (config.adminApiKey && url.pathname.startsWith('/admin/')) {
      const adminApiKey = getHeaderValue(req.headers[ADMIN_API_KEY_HEADER]);

      if (adminApiKey !== config.adminApiKey) {
        res.writeHead(401, {
          ...CORS_HEADERS,
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        });
        res.end(JSON.stringify({ error: 'Invalid admin API key' }));
        return;
      }
    }

    const body = await readBody(req);

    try {
      const response = await handler({
        method: req.method.toUpperCase(),
        path: url.pathname,
        query: url.searchParams,
        headers: req.headers,
        body,
        bodyText: body.toString('utf8'),
      });

      res.writeHead(response.status, {
        ...CORS_HEADERS,
        ...(response.headers ?? {}),
      });
      res.end(response.body);
    } catch (error) {
      if (error instanceof ZodError) {
        res.writeHead(400, {
          ...CORS_HEADERS,
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

      forgeDebug({ scope: 'http-server', level: 'error', message: 'HTTP request failed', context: { method: req.method, pathname: url.pathname, error } });
      res.writeHead(500, {
        ...CORS_HEADERS,
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

  function registerRoute(input: { method: 'GET' | 'POST' | 'PATCH' | 'DELETE'; path: string; handler: HttpHandler }) {
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
    port: config.port,
  };
}

function getHeaderValue(value: string | string[] | undefined) {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value[0];
  }

  return undefined;
}

function readBody(request: http.IncomingMessage) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];

    request.on('data', (chunk) => {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    });

    request.on('end', () => {
      resolve(Buffer.concat(chunks));
    });

    request.on('error', reject);
  });
}
