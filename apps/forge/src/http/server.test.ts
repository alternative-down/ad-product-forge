import http from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createForgeHttpServer,
  type HttpHandler,
  type HttpRequest,
  type HttpResponse,
} from './server';

// Minimal HTTP client that uses Node's http module directly
async function makeRawRequest(
  method: string,
  path: string,
  body?: string,
  headers?: Record<string, string>,
  portOverride?: number,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const opts: http.RequestOptions = {
      hostname: 'localhost',
      port: portOverride ?? testPort,
      path,
      method,
      headers: {
        'content-type': 'application/json',
        ...headers,
      },
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body: data });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

let testPort = 0;

describe('createForgeHttpServer', () => {
  let server: ReturnType<typeof createForgeHttpServer>;
  let baseUrl: string;

  beforeEach(async () => {
    testPort = 30000 + Math.floor(Math.random() * 20000);
    server = createForgeHttpServer({ port: testPort });
    await server.start();
    baseUrl = `http://localhost:${testPort}`;
  });

  afterEach(async () => {
    await server.stop();
  });

  describe('registerRoute and server lifecycle', () => {
    it('starts on the configured port', async () => {
      expect(server.port).toBe(testPort);
    });

    it('registers a GET route and returns response', async () => {
      let hitCount = 0;
      server.registerRoute({
        method: 'GET',
        path: '/test',
        handler: async () => {
          hitCount++;
          return { status: 200, body: 'ok' };
        },
      });

      const res = await makeRawRequest('GET', '/test');
      expect(res.status).toBe(200);
      expect(res.body).toBe('ok');
      expect(hitCount).toBe(1);
    });

    it('registers a POST route with JSON body', async () => {
      server.registerRoute({
        method: 'POST',
        path: '/echo',
        handler: async (req) => {
          const parsed = JSON.parse(req.bodyText);
          return { status: 201, body: JSON.stringify({ received: parsed }) };
        },
      });

      const res = await makeRawRequest('POST', '/echo', JSON.stringify({ hello: 'world' }));
      expect(res.status).toBe(201);
      expect(JSON.parse(res.body)).toEqual({ received: { hello: 'world' } });
    });

    it('returns 404 for unregistered routes', async () => {
      const res = await makeRawRequest('GET', '/nonexistent');
      expect(res.status).toBe(404);
    });

    it('returns 404 for registered method but different method', async () => {
      server.registerRoute({
        method: 'POST',
        path: '/only-post',
        handler: async () => ({ status: 200, body: 'post only' }),
      });
      const res = await makeRawRequest('GET', '/only-post');
      expect(res.status).toBe(404);
    });

    it('unregisters a route when the cleanup function is called', async () => {
      const unregister = server.registerRoute({
        method: 'GET',
        path: '/temp',
        handler: async () => ({ status: 200, body: 'temp' }),
      });

      let res = await makeRawRequest('GET', '/temp');
      expect(res.status).toBe(200);

      unregister();

      res = await makeRawRequest('GET', '/temp');
      expect(res.status).toBe(404);
    });

    it('registers multiple routes on different paths', async () => {
      server.registerRoute({
        method: 'GET',
        path: '/a',
        handler: async () => ({ status: 200, body: 'a' }),
      });
      server.registerRoute({
        method: 'GET',
        path: '/b',
        handler: async () => ({ status: 200, body: 'b' }),
      });

      const [resA, resB] = await Promise.all([
        makeRawRequest('GET', '/a'),
        makeRawRequest('GET', '/b'),
      ]);
      expect(resA.body).toBe('a');
      expect(resB.body).toBe('b');
    });

    it('registers multiple routes on same path different methods', async () => {
      server.registerRoute({
        method: 'GET',
        path: '/resource',
        handler: async () => ({ status: 200, body: 'GET' }),
      });
      server.registerRoute({
        method: 'POST',
        path: '/resource',
        handler: async () => ({ status: 201, body: 'POST' }),
      });

      const [resGet, resPost] = await Promise.all([
        makeRawRequest('GET', '/resource'),
        makeRawRequest('POST', '/resource', '{}'),
      ]);
      expect(resGet.body).toBe('GET');
      expect(resPost.body).toBe('POST');
    });
  });

  describe('request parsing', () => {
    it('parses query string parameters', async () => {
      server.registerRoute({
        method: 'GET',
        path: '/search',
        handler: async (req) => {
          return { status: 200, body: JSON.stringify(Object.fromEntries(req.query)) };
        },
      });

      const res = await makeRawRequest('GET', '/search?q=test&page=1');
      expect(res.status).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ q: 'test', page: '1' });
    });

    it('passes request headers to the handler', async () => {
      server.registerRoute({
        method: 'GET',
        path: '/headers',
        handler: async (req) => {
          return {
            status: 200,
            body: JSON.stringify({ hasContentType: 'content-type' in req.headers }),
          };
        },
      });

      const res = await makeRawRequest('GET', '/headers', undefined, { 'x-custom': 'value' });
      expect(res.status).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ hasContentType: true });
    });

    it('passes method to the handler', async () => {
      server.registerRoute({
        method: 'POST',
        path: '/method-check',
        handler: async (req) => {
          return { status: 200, body: req.method };
        },
      });

      const res = await makeRawRequest('POST', '/method-check', '{}');
      expect(res.status).toBe(200);
      expect(res.body).toBe('POST');
    });

    it('handles empty body', async () => {
      server.registerRoute({
        method: 'GET',
        path: '/empty-check',
        handler: async (req) => {
          return { status: 200, body: String(req.body.length) };
        },
      });

      const res = await makeRawRequest('GET', '/empty-check');
      expect(res.status).toBe(200);
      expect(res.body).toBe('0');
    });
  });

  describe('error handling', () => {
    it('returns 500 for handlers that throw non-ZodError', async () => {
      server.registerRoute({
        method: 'GET',
        path: '/error',
        handler: async () => {
          throw new Error('Intentional error');
        },
      });

      const res = await makeRawRequest('GET', '/error');
      expect(res.status).toBe(500);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Intentional error');
    });

    it('returns 400 for handlers that throw ZodError', async () => {
      const { ZodError, z } = await import('zod');
      const testSchema = z.object({ name: z.string() });

      server.registerRoute({
        method: 'POST',
        path: '/validate',
        handler: async (req) => {
          const parsed = testSchema.parse(JSON.parse(req.bodyText));
          return { status: 200, body: JSON.stringify(parsed) };
        },
      });

      const res = await makeRawRequest('POST', '/validate', JSON.stringify({ name: 123 }));
      expect(res.status).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Invalid request');
      expect(body.details).toBeTruthy();
    });

    it('returns 500 for non-Error thrown values', async () => {
      server.registerRoute({
        method: 'GET',
        path: '/bad-error',
        handler: async () => {
          throw 'string error' as unknown as Error;
        },
      });

      const res = await makeRawRequest('GET', '/bad-error');
      expect(res.status).toBe(500);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('string error');
    });

    it('returns 500 when handler returns rejected promise', async () => {
      server.registerRoute({
        method: 'GET',
        path: '/async-error',
        handler: async () => {
          await Promise.resolve();
          throw new Error('async error');
        },
      });

      const res = await makeRawRequest('GET', '/async-error');
      expect(res.status).toBe(500);
    });

    it('handler returning a non-promise response still works', async () => {
      server.registerRoute({
        method: 'GET',
        path: '/sync-ok',
        handler: () => ({ status: 204, body: '' }),
      });

      const res = await makeRawRequest('GET', '/sync-ok');
      expect(res.status).toBe(204);
    });
  });

  describe('body size limit', () => {
    it('handles streaming body that completes within limit', async () => {
      server.registerRoute({
        method: 'POST',
        path: '/stream-check',
        handler: async (req) => ({ status: 200, body: String(req.body.length) }),
      });

      // 500KB body - well within limit
      const body = 'y'.repeat(512 * 1024);
      const res = await makeRawRequest('POST', '/stream-check', body);
      expect(res.status).toBe(200);
      expect(JSON.parse(res.body)).toBe(512 * 1024);
    });

    it('returns 413 for body that exceeds the limit', async () => {
      server.registerRoute({
        method: 'POST',
        path: '/size-check',
        handler: async () => ({ status: 200, body: 'ok' }),
      });

      // 2MB body - exceeds the 1MB default limit
      const body = 'x'.repeat(2 * 1024 * 1024);
      const res = await makeRawRequest('POST', '/size-check', body);
      expect(res.status).toBe(413);
      expect(JSON.parse(res.body)).toEqual({ error: 'Request body too large' });
    });

    it('respects custom maxBodyBytes from server config', async () => {
      const smallServer = createForgeHttpServer({ port: 0, maxBodyBytes: 512 * 1024 });
      smallServer.registerRoute({
        method: 'POST',
        path: '/small-limit',
        handler: async (req) => ({ status: 200, body: String(req.body.length) }),
      });
      await smallServer.start();

      try {
        const savedPort = testPort;
        testPort = smallServer.port as number;
        try {
          const body = 'z'.repeat(256 * 1024);
          const res = await makeRawRequest('POST', '/small-limit', body);
          expect(res.status).toBe(200);
          expect(JSON.parse(res.body)).toBe(256 * 1024);

          const largeBody = 'z'.repeat(768 * 1024);
          const res2 = await makeRawRequest('POST', '/small-limit', largeBody);
          expect(res2.status).toBe(413);
          expect(JSON.parse(res2.body)).toEqual({ error: 'Request body too large' });
        } finally {
          testPort = savedPort;
        }
      } finally {
        await smallServer.stop();
      }
    });
  });

  describe('CORS headers', () => {
    it('sets CORS headers on success responses', async () => {
      server.registerRoute({
        method: 'GET',
        path: '/cors-test',
        handler: async () => ({ status: 200, body: 'ok' }),
      });

      const res = await makeRawRequest('GET', '/cors-test');
      expect(res.headers['access-control-allow-origin']).toBe('*');
      expect(res.headers['access-control-allow-methods']).toBe('GET,POST,PATCH,DELETE,OPTIONS');
    });

    it('sets CORS headers on error responses', async () => {
      server.registerRoute({
        method: 'GET',
        path: '/cors-error',
        handler: async () => {
          throw new Error('err');
        },
      });

      const res = await makeRawRequest('GET', '/cors-error');
      expect(res.headers['access-control-allow-origin']).toBe('*');
    });

    it('allows overriding headers via response.headers', async () => {
      server.registerRoute({
        method: 'GET',
        path: '/override',
        handler: async () => ({
          status: 200,
          body: 'ok',
          headers: { 'x-custom': 'value', 'content-type': 'text/plain' },
        }),
      });

      const res = await makeRawRequest('GET', '/override');
      expect(res.headers['x-custom']).toBe('value');
    });
  });

  describe('response headers', () => {
    it('passes through custom response headers', async () => {
      server.registerRoute({
        method: 'GET',
        path: '/custom-header',
        handler: async () => ({
          status: 200,
          body: 'ok',
          headers: { 'x-forge-test': 'hello' },
        }),
      });

      const res = await makeRawRequest('GET', '/custom-header');
      expect(res.headers['x-forge-test']).toBe('hello');
    });

    it('allows multiple custom headers', async () => {
      server.registerRoute({
        method: 'GET',
        path: '/multi-header',
        handler: async () => ({
          status: 200,
          body: 'ok',
          headers: { 'x-a': '1', 'x-b': '2' },
        }),
      });

      const res = await makeRawRequest('GET', '/multi-header');
      expect(res.headers['x-a']).toBe('1');
      expect(res.headers['x-b']).toBe('2');
    });
  });

  describe('concurrent requests', () => {
    it('handles concurrent requests to different routes', async () => {
      server.registerRoute({
        method: 'GET',
        path: '/c1',
        handler: async () => ({ status: 200, body: '1' }),
      });
      server.registerRoute({
        method: 'GET',
        path: '/c2',
        handler: async () => ({ status: 200, body: '2' }),
      });
      server.registerRoute({
        method: 'GET',
        path: '/c3',
        handler: async () => ({ status: 200, body: '3' }),
      });

      const results = await Promise.all([
        makeRawRequest('GET', '/c1'),
        makeRawRequest('GET', '/c2'),
        makeRawRequest('GET', '/c3'),
      ]);

      expect(results.map((r) => r.body)).toEqual(['1', '2', '3']);
    });

    it('handles concurrent requests to the same route', async () => {
      let counter = 0;
      server.registerRoute({
        method: 'GET',
        path: '/shared',
        handler: async () => {
          counter++;
          await Promise.resolve(); // simulate async work
          return { status: 200, body: String(counter) };
        },
      });

      const results = await Promise.all([
        makeRawRequest('GET', '/shared'),
        makeRawRequest('GET', '/shared'),
        makeRawRequest('GET', '/shared'),
      ]);

      expect(results.map((r) => r.body).sort()).toEqual(['1', '2', '3']);
    });

    it('handles mixed POST and GET concurrently', async () => {
      server.registerRoute({
        method: 'GET',
        path: '/mixed-get',
        handler: async () => ({ status: 200, body: 'get' }),
      });
      server.registerRoute({
        method: 'POST',
        path: '/mixed-post',
        handler: async (req) => ({ status: 201, body: req.bodyText }),
      });

      const [resGet, resPost] = await Promise.all([
        makeRawRequest('GET', '/mixed-get'),
        makeRawRequest('POST', '/mixed-post', '"hello"'),
      ]);

      expect(resGet.body).toBe('get');
      expect(resPost.body).toBe('"hello"');
    });
  });

  describe('PATCH and DELETE methods', () => {
    it('registers a PATCH route', async () => {
      server.registerRoute({
        method: 'PATCH',
        path: '/patch-me',
        handler: async (req) => ({ status: 200, body: req.bodyText }),
      });

      const res = await makeRawRequest('PATCH', '/patch-me', '{"updated": true}');
      expect(res.status).toBe(200);
      expect(res.body).toBe('{"updated": true}');
    });

    it('registers a DELETE route', async () => {
      let deleted = false;
      server.registerRoute({
        method: 'DELETE',
        path: '/delete-me',
        handler: async () => {
          deleted = true;
          return { status: 204, body: '' };
        },
      });

      const res = await makeRawRequest('DELETE', '/delete-me');
      expect(res.status).toBe(204);
      expect(deleted).toBe(true);
    });

    it('PATCH and DELETE routes are separate', async () => {
      server.registerRoute({
        method: 'PATCH',
        path: '/same',
        handler: async () => ({ status: 200, body: 'patch' }),
      });
      server.registerRoute({
        method: 'DELETE',
        path: '/same',
        handler: async () => ({ status: 200, body: 'delete' }),
      });

      const [resPatch, resDelete] = await Promise.all([
        makeRawRequest('PATCH', '/same', '{}'),
        makeRawRequest('DELETE', '/same'),
      ]);
      expect(resPatch.body).toBe('patch');
      expect(resDelete.body).toBe('delete');
    });
  });

  describe('stop()', () => {
    it('stop() is a function on the server object', () => {
      expect(typeof server.stop).toBe('function');
    });
  });

  describe('admin authentication', () => {
    const ADMIN_KEY = 'test-admin-key-123';

    describe('when adminApiKey is configured', () => {
      let adminServer: Awaited<ReturnType<typeof createForgeHttpServer>>;

      beforeEach(async () => {
        testPort = 30000 + Math.floor(Math.random() * 20000);
        adminServer = createForgeHttpServer({ port: testPort, adminApiKey: ADMIN_KEY });
        await adminServer.start();
      });

      afterEach(async () => {
        await adminServer.stop();
      });

      it('serves /admin/* with correct API key', async () => {
        adminServer.registerRoute({
          method: 'GET',
          path: '/admin/test',
          handler: async () => ({ status: 200, body: 'admin ok' }),
        });

        const res = await makeRawRequest('GET', '/admin/test', undefined, {
          'x-forge-admin-api-key': ADMIN_KEY,
        });
        expect(res.status).toBe(200);
        expect(res.body).toBe('admin ok');
      });

      it('returns 401 for /admin/* with wrong API key', async () => {
        adminServer.registerRoute({
          method: 'GET',
          path: '/admin/test',
          handler: async () => ({ status: 200, body: 'admin ok' }),
        });

        const res = await makeRawRequest('GET', '/admin/test', undefined, {
          'x-forge-admin-api-key': 'wrong-key',
        });
        expect(res.status).toBe(401);
        expect(res.body).toContain('Invalid admin API key');
      });

      it('returns 401 for /admin/* without API key header', async () => {
        adminServer.registerRoute({
          method: 'GET',
          path: '/admin/test',
          handler: async () => ({ status: 200, body: 'admin ok' }),
        });

        const res = await makeRawRequest('GET', '/admin/test');
        expect(res.status).toBe(401);
        expect(res.body).toContain('Invalid admin API key');
      });

      it('serves non-admin routes without API key', async () => {
        adminServer.registerRoute({
          method: 'GET',
          path: '/public',
          handler: async () => ({ status: 200, body: 'public' }),
        });

        const res = await makeRawRequest('GET', '/public');
        expect(res.status).toBe(200);
        expect(res.body).toBe('public');
      });
    });

    describe('when adminApiKey is not configured', () => {
      it('returns 503 for /admin/* when allowInsecureLocal is false', async () => {
        const srv = createForgeHttpServer({ port: 0 });
        srv.registerRoute({
          method: 'GET',
          path: '/admin/test',
          handler: async () => ({ status: 200, body: 'should not reach here' }),
        });

        await srv.start();
        const res = await makeRawRequest('GET', '/admin/test', undefined, {}, srv.port);
        await srv.stop();

        expect(res.status).toBe(503);
        expect(res.body).toContain('Admin authentication not configured');
      });

      it('serves /admin/* without auth when allowInsecureLocal is true', async () => {
        const srv = createForgeHttpServer({
          port: 0,
          allowInsecureLocal: true,
        });
        srv.registerRoute({
          method: 'GET',
          path: '/admin/test',
          handler: async () => ({ status: 200, body: 'local admin ok' }),
        });

        await srv.start();
        const res = await makeRawRequest('GET', '/admin/test', undefined, {}, srv.port);
        await srv.stop();

        expect(res.status).toBe(200);
        expect(res.body).toBe('local admin ok');
      });

      it('serves non-admin routes without auth even when no adminApiKey is set', async () => {
        const srv = createForgeHttpServer({ port: 0 });
        srv.registerRoute({
          method: 'GET',
          path: '/public',
          handler: async () => ({ status: 200, body: 'public' }),
        });

        await srv.start();
        const res = await makeRawRequest('GET', '/public', undefined, {}, srv.port);
        await srv.stop();

        expect(res.status).toBe(200);
        expect(res.body).toBe('public');
      });
    });

    describe('allowedOrigins CORS', () => {
      it('sets access-control-allow-origin to matching allowed origin', async () => {
        const srv = createForgeHttpServer({
          port: 0,
          adminApiKey: 'key',
          allowedOrigins: ['https://admin.example.com', 'https://dashboard.example.com'],
        });
        srv.registerRoute({
          method: 'GET',
          path: '/admin/test',
          handler: async () => ({ status: 200, body: 'ok' }),
        });

        await srv.start();
        const res = await makeRawRequest(
          'GET',
          '/admin/test',
          undefined,
          {
            'x-forge-admin-api-key': 'key',
            origin: 'https://admin.example.com',
          },
          srv.port,
        );
        await srv.stop();

        expect(res.headers['access-control-allow-origin']).toBe('https://admin.example.com');
      });

      it('sets wildcard CORS when allowedOrigins is configured but origin not in list', async () => {
        const srv = createForgeHttpServer({
          port: 0,
          adminApiKey: 'key',
          allowedOrigins: ['https://admin.example.com'],
        });
        srv.registerRoute({
          method: 'GET',
          path: '/admin/test',
          handler: async () => ({ status: 200, body: 'ok' }),
        });

        await srv.start();
        const res = await makeRawRequest(
          'GET',
          '/admin/test',
          undefined,
          {
            'x-forge-admin-api-key': 'key',
            origin: 'https://unknown.com',
          },
          srv.port,
        );
        await srv.stop();

        expect(res.headers['access-control-allow-origin']).toBe('*');
      });
    });
  });
});
