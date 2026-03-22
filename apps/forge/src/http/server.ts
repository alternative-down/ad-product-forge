import http, { type IncomingHttpHeaders } from 'node:http';
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

type HttpHandler = (request: HttpRequest) => Promise<HttpResponse> | HttpResponse;

type RouteKey = `${string} ${string}`;

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type',
};

export function createForgeHttpServer(config: { port: number }) {
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

      console.error(`[ForgeHttpServer] ${req.method} ${url.pathname} failed:`, error);
      res.writeHead(500, CORS_HEADERS).end('Internal server error');
    }
  });

  function registerRoute(input: { method: 'GET' | 'POST'; path: string; handler: HttpHandler }) {
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
