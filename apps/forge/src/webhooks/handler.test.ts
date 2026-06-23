/**
 * Unit tests for webhooks/handler.ts — webhook HTTP handler.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { createWebhookHandler } from './handler';
import type { HttpRequest, HttpResponse } from '../http/server';

// Closes #5963: HMAC-SHA256 signing helper (matches verifyWebhookSignature impl).
const signWebhookBody = (body: string, secret: string): string =>
  'sha256=' + createHmac('sha256', secret).update(body).digest('hex');

// Closes #5963: makeReq defaults include a valid HMAC-SHA256 signature for
// the default test secret. Tests that exercise missing/invalid signature
// override headers explicitly.
const TEST_SECRET = 'test-secret';
const DEFAULT_BODY = '{"action":"push","repository":"acme/repo"}';

const makeReq = (overrides: Partial<HttpRequest> = {}): HttpRequest => {
  const bodyText = (overrides as { bodyText?: string }).bodyText ?? DEFAULT_BODY;
  return {
    path: '/webhooks/route-123',
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forge-signature': signWebhookBody(bodyText, TEST_SECRET),
    },
    bodyText,
    ...overrides,
  } as unknown as HttpRequest;
};

describe('createWebhookHandler', () => {
  const mockStore = vi.hoisted(() => ({
    getRoute: vi.fn(),
    createEvent: vi.fn(),
  }));

  const mockNotify = vi.hoisted(() => vi.fn());

  const makeHandler = () =>
    createWebhookHandler({ store: mockStore as any, notifyAgent: mockNotify });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('route not found', () => {
    it('returns 404 for non-matching path', async () => {
      const handler = makeHandler();
      const result = await handler.handleWebhook({
        ...makeReq(),
        path: '/wrong/path',
      } as unknown as HttpRequest);
      expect(result.status).toBe(404);
    });

    it('returns 404 when route does not exist', async () => {
      mockStore.getRoute.mockResolvedValue(null);
      const handler = makeHandler();
      const result = await handler.handleWebhook(makeReq());
      expect(result.status).toBe(404);
    });

    it('returns 404 when route is inactive', async () => {
      mockStore.getRoute.mockResolvedValue({
        routeId: 'r1',
        agentId: 'agent-1',
        name: 'Test',
        secret: 'test-secret',
        isActive: false,
      });
      const handler = makeHandler();
      const result = await handler.handleWebhook(makeReq());
      expect(result.status).toBe(404);
    });
  });

  describe('signature verification', () => {
    it('returns 401 when signature header missing on protected route', async () => {
      mockStore.getRoute.mockResolvedValue({
        routeId: 'r1',
        agentId: 'agent-1',
        name: 'GitHub',
        secret: 'valid-secret',
        isActive: true,
      });
      const handler = makeHandler();
      const result = await handler.handleWebhook(
        makeReq({ headers: { 'content-type': 'application/json' } } as unknown as HttpRequest),
      );
      expect(result.status).toBe(401);
      expect(result.body).toBe('Missing signature');
    });

    it('returns 401 when signature is invalid', async () => {
      mockStore.getRoute.mockResolvedValue({
        routeId: 'r1',
        agentId: 'agent-1',
        name: 'GitHub',
        secret: 'correct-secret',
        isActive: true,
      });
      const handler = makeHandler();
      const result = await handler.handleWebhook(
        makeReq({
          headers: {
            'content-type': 'application/json',
            'x-forge-signature': 'sha256=invalidsignature',
          },
        } as unknown as HttpRequest),
      );
      expect(result.status).toBe(401);
      expect(result.body).toBe('Invalid signature');
    });

    it('accepts valid sha256= signature', async () => {
      const rawBody = makeReq().bodyText!;
      const expected = signWebhookBody(rawBody, 'my-secret');

      mockStore.getRoute.mockResolvedValue({
        routeId: 'r1',
        agentId: 'agent-1',
        name: 'GitHub',
        secret: 'my-secret',
        isActive: true,
      });
      mockStore.createEvent.mockResolvedValue({ kind: 'created', eventId: 'event-1' });
      mockNotify.mockReturnValue(undefined);

      const handler = makeHandler();
      const result = await handler.handleWebhook(
        makeReq({
          headers: { 'content-type': 'application/json', 'x-forge-signature': expected },
        } as unknown as HttpRequest),
      );
      expect(result.status).toBe(202);
    });

    it('accepts valid x-hub-signature-256 header (HMAC-SHA256)', async () => {
      const rawBody = makeReq().bodyText!;
      const expected = signWebhookBody(rawBody, 'my-secret');

      mockStore.getRoute.mockResolvedValue({
        routeId: 'r1',
        agentId: 'agent-1',
        name: 'GitHub',
        secret: 'my-secret',
        isActive: true,
      });
      mockStore.createEvent.mockResolvedValue({ kind: 'created', eventId: 'event-1' });
      mockNotify.mockReturnValue(undefined);

      const handler = makeHandler();
      const result = await handler.handleWebhook(
        makeReq({
          headers: { 'content-type': 'application/json', 'x-hub-signature-256': expected },
        } as unknown as HttpRequest),
      );
      expect(result.status).toBe(202);
    });

    // Closes #5963: defense-in-depth — null/empty secret means misconfigured.
    // Fail closed with 500 instead of silently accepting unsigned requests.
    it('returns 500 when route has no secret (fail-closed)', async () => {
      mockStore.getRoute.mockResolvedValue({
        routeId: 'r1',
        agentId: 'agent-1',
        name: 'Misconfigured',
        secret: null,
        isActive: true,
      });

      const handler = makeHandler();
      const result = await handler.handleWebhook(makeReq());
      expect(result.status).toBe(500);
      expect(result.body).toBe('Route misconfigured');
      // No event created, no notification sent
      expect(mockStore.createEvent).not.toHaveBeenCalled();
      expect(mockNotify).not.toHaveBeenCalled();
    });

    it('returns 500 when route has empty-string secret (fail-closed)', async () => {
      mockStore.getRoute.mockResolvedValue({
        routeId: 'r1',
        agentId: 'agent-1',
        name: 'Misconfigured',
        secret: '',
        isActive: true,
      });

      const handler = makeHandler();
      const result = await handler.handleWebhook(makeReq());
      expect(result.status).toBe(500);
    });

    it('returns 401 when signature header is an array', async () => {
      mockStore.getRoute.mockResolvedValue({
        routeId: 'r1',
        agentId: 'agent-1',
        name: 'GitHub',
        secret: 'my-secret',
        isActive: true,
      });
      const handler = makeHandler();
      const result = await handler.handleWebhook(
        makeReq({
          headers: { 'content-type': 'application/json', 'x-forge-signature': ['sha256=bad'] },
        } as unknown as unknown as HttpRequest),
      );
      expect(result.status).toBe(401);
    });
  });

  describe('payload parsing', () => {
    it('returns 400 for invalid JSON payload', async () => {
      const bodyText = 'not json';
      mockStore.getRoute.mockResolvedValue({
        routeId: 'r1',
        agentId: 'agent-1',
        name: 'Test',
        secret: 'test-secret',
        isActive: true,
      });
      const handler = makeHandler();
      const result = await handler.handleWebhook(
        makeReq({
          bodyText,
          headers: {
            'content-type': 'application/json',
            'x-forge-signature': signWebhookBody(bodyText, 'test-secret'),
          },
        } as unknown as HttpRequest),
      );
      expect(result.status).toBe(400);
      expect(result.body).toBe('Invalid JSON payload');
    });

    it('returns 400 for empty body', async () => {
      const bodyText = '';
      mockStore.getRoute.mockResolvedValue({
        routeId: 'r1',
        agentId: 'agent-1',
        name: 'Test',
        secret: 'test-secret',
        isActive: true,
      });
      const handler = makeHandler();
      const result = await handler.handleWebhook(
        makeReq({
          bodyText,
          headers: {
            'content-type': 'application/json',
            'x-forge-signature': signWebhookBody(bodyText, 'test-secret'),
          },
        } as unknown as HttpRequest),
      );
      expect(result.status).toBe(400);
    });
  });

  describe('event creation and notification', () => {
    it('returns 202 with eventId on success', async () => {
      mockStore.getRoute.mockResolvedValue({
        routeId: 'r1',
        agentId: 'agent-1',
        name: 'GitHub',
        secret: 'test-secret',
        isActive: true,
      });
      mockStore.createEvent.mockResolvedValue({ kind: 'created', eventId: 'event-456' });
      mockNotify.mockReturnValue(undefined);

      const handler = makeHandler();
      const result = await handler.handleWebhook(makeReq());
      expect(result.status).toBe(202);
      expect(JSON.parse(result.body as string)).toEqual({ eventId: 'event-456' });
    });

    it('stores event with agentId and routeId from route', async () => {
      mockStore.getRoute.mockResolvedValue({
        routeId: 'r1',
        agentId: 'agent-42',
        name: 'Stripe',
        secret: 'test-secret',
        isActive: true,
      });
      mockStore.createEvent.mockResolvedValue({ kind: 'created', eventId: 'e1' });
      mockNotify.mockReturnValue(undefined);

      const handler = makeHandler();
      await handler.handleWebhook(makeReq());
      expect(mockStore.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({ routeId: 'route-123', agentId: 'agent-42' }),
      );
    });

    it('extracts headers from request', async () => {
      mockStore.getRoute.mockResolvedValue({
        routeId: 'r1',
        agentId: 'agent-1',
        name: 'Test',
        secret: 'test-secret',
        isActive: true,
      });
      mockStore.createEvent.mockResolvedValue({ kind: 'created', eventId: 'e1' });
      mockNotify.mockReturnValue(undefined);

      const handler = makeHandler();
      await handler.handleWebhook(
        makeReq({
          headers: {
            'content-type': 'application/json',
            'user-agent': 'GitHub-Hookshot',
            'x-forwarded-for': '1.2.3.4',
            'x-forge-signature': signWebhookBody(makeReq().bodyText!, 'test-secret'),
          },
        } as unknown as HttpRequest),
      );
      expect(mockStore.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'content-type': 'application/json',
            'user-agent': 'GitHub-Hookshot',
            'x-forwarded-for': '1.2.3.4',
          }),
        }),
      );
    });

    it('uses x-idempotency-key header if provided', async () => {
      mockStore.getRoute.mockResolvedValue({
        routeId: 'r1',
        agentId: 'agent-1',
        name: 'Test',
        secret: 'test-secret',
        isActive: true,
      });
      mockStore.createEvent.mockResolvedValue({ kind: 'created', eventId: 'e1' });
      mockNotify.mockReturnValue(undefined);

      const handler = makeHandler();
      await handler.handleWebhook(
        makeReq({
          headers: {
            'content-type': 'application/json',
            'x-idempotency-key': 'unique-key-123',
            'x-forge-signature': signWebhookBody(makeReq().bodyText!, 'test-secret'),
          },
        } as unknown as HttpRequest),
      );
      expect(mockStore.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({ idempotencyKey: 'unique-key-123' }),
      );
    });

    it('passes undefined idempotencyKey when header absent', async () => {
      mockStore.getRoute.mockResolvedValue({
        routeId: 'r1',
        agentId: 'agent-1',
        name: 'Test',
        secret: 'test-secret',
        isActive: true,
      });
      mockStore.createEvent.mockResolvedValue({ kind: 'created', eventId: 'e1' });
      mockNotify.mockReturnValue(undefined);

      const handler = makeHandler();
      await handler.handleWebhook(makeReq());
      expect(mockStore.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({ idempotencyKey: undefined }),
      );
    });

    it('sends notification after storing event', async () => {
      mockStore.getRoute.mockResolvedValue({
        routeId: 'r1',
        agentId: 'agent-1',
        name: 'GitHub',
        secret: 'test-secret',
        isActive: true,
      });
      mockStore.createEvent.mockResolvedValue({ kind: 'created', eventId: 'e1' });
      mockNotify.mockReturnValue(undefined);

      const handler = makeHandler();
      await handler.handleWebhook(makeReq());
      expect(mockNotify).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'agent-1',
          groupKey: 'webhook:e1',
          type: 'webhook',
          idempotencyKey: 'webhook:e1',
        }),
      );
    });

    it('handles array x-forwarded-for by taking first element', async () => {
      mockStore.getRoute.mockResolvedValue({
        routeId: 'r1',
        agentId: 'agent-1',
        name: 'Test',
        secret: 'test-secret',
        isActive: true,
      });
      mockStore.createEvent.mockResolvedValue({ kind: 'created', eventId: 'e1' });
      mockNotify.mockReturnValue(undefined);

      const handler = makeHandler();
      await handler.handleWebhook(
        makeReq({
          headers: {
            'content-type': 'application/json',
            'x-forwarded-for': ['1.2.3.4', '5.6.7.8'],
            'x-forge-signature': signWebhookBody(makeReq().bodyText!, 'test-secret'),
          },
        } as unknown as unknown as HttpRequest),
      );
      expect(mockStore.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({ 'x-forwarded-for': '1.2.3.4' }),
        }),
      );
    });

    it('returns 200 with deduplicated:true on idempotent replay (T1, T7: AC-1 + AC-5)', async () => {
      mockStore.getRoute.mockResolvedValue({
        routeId: 'r1', agentId: 'agent-1', name: 'GitHub', secret: 'test-secret', isActive: true,
      });
      mockStore.createEvent.mockResolvedValue({ kind: 'duplicate', eventId: 'event-1' });
      mockNotify.mockReturnValue(undefined);

      const handler = makeHandler();
      const result = await handler.handleWebhook(makeReq());
      expect(result.status).toBe(200);
      expect(JSON.parse(result.body as string)).toEqual({
        eventId: 'event-1',
        deduplicated: true,
      });
    });

    it('does NOT call notifyAgent on idempotent replay (skip duplicate notification)', async () => {
      mockStore.getRoute.mockResolvedValue({
        routeId: 'r1', agentId: 'agent-1', name: 'GitHub', secret: 'test-secret', isActive: true,
      });
      mockStore.createEvent.mockResolvedValue({ kind: 'duplicate', eventId: 'event-1' });
      mockNotify.mockReturnValue(undefined);

      const handler = makeHandler();
      await handler.handleWebhook(makeReq());
      expect(mockNotify).not.toHaveBeenCalled();
    });

    it('returns 202 on first call (created) and 200 on replay (duplicate) — full T1 flow', async () => {
      mockStore.getRoute.mockResolvedValue({
        routeId: 'r1', agentId: 'agent-1', name: 'GitHub', secret: 'test-secret', isActive: true,
      });
      mockStore.createEvent
        .mockResolvedValueOnce({ kind: 'created', eventId: 'event-1' })
        .mockResolvedValueOnce({ kind: 'duplicate', eventId: 'event-1' });
      mockNotify.mockReturnValue(undefined);

      const handler = makeHandler();
      const first = await handler.handleWebhook(makeReq());
      const second = await handler.handleWebhook(makeReq());

      expect(first.status).toBe(202);
      expect(JSON.parse(first.body as string)).toEqual({ eventId: 'event-1' });
      expect(second.status).toBe(200);
      expect(JSON.parse(second.body as string)).toEqual({
        eventId: 'event-1',
        deduplicated: true,
      });

      // Notify called exactly once (only on the first call).
      expect(mockNotify).toHaveBeenCalledTimes(1);
    });
  });
});
