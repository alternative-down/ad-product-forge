/**
 * Unit tests for webhooks/handler.ts — webhook HTTP handler.
 */
import { describe, expect, it, vi } from 'vitest';
import { createWebhookHandler } from './handler';
import type { HttpRequest, HttpResponse } from '../http/server';

const makeReq = (overrides: Partial<HttpRequest> = {}): HttpRequest =>
  ({
    path: '/webhooks/route-123',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    bodyText: '{"action":"push","repository":"acme/repo"}',
    ...overrides,
  } as HttpRequest);

describe('createWebhookHandler', () => {
  const mockStore = vi.hoisted(() => ({
    getRoute: vi.fn(),
    createEvent: vi.fn(),
  }));

  const mockNotify = vi.hoisted(() => vi.fn());

  const makeHandler = () =>
    createWebhookHandler({ store: mockStore as unknown as ReturnType<typeof mockStore>, notifyAgent: mockNotify });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('route not found', () => {
    it('returns 404 for non-matching path', async () => {
      const handler = makeHandler();
      const result = await handler.handleWebhook({ ...makeReq(), path: '/wrong/path' } as HttpRequest);
      expect(result.status).toBe(404);
    });

    it('returns 404 when route does not exist', async () => {
      mockStore.getRoute.mockResolvedValue(null);
      const handler = makeHandler();
      const result = await handler.handleWebhook(makeReq());
      expect(result.status).toBe(404);
    });

    it('returns 404 when route is inactive', async () => {
      mockStore.getRoute.mockResolvedValue({ routeId: 'r1', agentId: 'agent-1', name: 'Test', secret: null, isActive: false });
      const handler = makeHandler();
      const result = await handler.handleWebhook(makeReq());
      expect(result.status).toBe(404);
    });
  });

  describe('signature verification', () => {
    it('returns 401 when signature header missing on protected route', async () => {
      mockStore.getRoute.mockResolvedValue({ routeId: 'r1', agentId: 'agent-1', name: 'GitHub', secret: 'valid-secret', isActive: true });
      const handler = makeHandler();
      const result = await handler.handleWebhook(makeReq({ headers: { 'content-type': 'application/json' } } as HttpRequest));
      expect(result.status).toBe(401);
      expect(result.body).toBe('Missing signature');
    });

    it('returns 401 when signature is invalid', async () => {
      mockStore.getRoute.mockResolvedValue({ routeId: 'r1', agentId: 'agent-1', name: 'GitHub', secret: 'correct-secret', isActive: true });
      const handler = makeHandler();
      const result = await handler.handleWebhook(
        makeReq({ headers: { 'content-type': 'application/json', 'x-forge-signature': 'sha256=invalidsignature' } } as HttpRequest),
      );
      expect(result.status).toBe(401);
      expect(result.body).toBe('Invalid signature');
    });

    it('accepts valid sha256= signature', async () => {
      const rawBody = makeReq().bodyText!;
      const crypto = await import('node:crypto');
      const expected = 'sha256=' + crypto.createHash('sha256').update(rawBody).digest('hex');

      mockStore.getRoute.mockResolvedValue({ routeId: 'r1', agentId: 'agent-1', name: 'GitHub', secret: 'my-secret', isActive: true });
      mockStore.createEvent.mockResolvedValue({ eventId: 'event-1' });
      mockNotify.mockReturnValue(undefined);

      const handler = makeHandler();
      const result = await handler.handleWebhook(
        makeReq({ headers: { 'content-type': 'application/json', 'x-forge-signature': expected } } as HttpRequest),
      );
      expect(result.status).toBe(202);
    });

    it('accepts valid x-hub-signature-256 header', async () => {
      const rawBody = makeReq().bodyText!;
      const crypto = await import('node:crypto');
      const expected = 'sha256=' + crypto.createHash('sha256').update(rawBody).digest('hex');

      mockStore.getRoute.mockResolvedValue({ routeId: 'r1', agentId: 'agent-1', name: 'GitHub', secret: 'my-secret', isActive: true });
      mockStore.createEvent.mockResolvedValue({ eventId: 'event-1' });
      mockNotify.mockReturnValue(undefined);

      const handler = makeHandler();
      const result = await handler.handleWebhook(
        makeReq({ headers: { 'content-type': 'application/json', 'x-hub-signature-256': expected } } as HttpRequest),
      );
      expect(result.status).toBe(202);
    });

    it('skips signature check when route has no secret', async () => {
      mockStore.getRoute.mockResolvedValue({ routeId: 'r1', agentId: 'agent-1', name: 'Public', secret: null, isActive: true });
      mockStore.createEvent.mockResolvedValue({ eventId: 'event-1' });
      mockNotify.mockReturnValue(undefined);

      const handler = makeHandler();
      const result = await handler.handleWebhook(makeReq());
      expect(result.status).toBe(202);
    });

    it('returns 401 when signature header is an array', async () => {
      mockStore.getRoute.mockResolvedValue({ routeId: 'r1', agentId: 'agent-1', name: 'GitHub', secret: 'my-secret', isActive: true });
      const handler = makeHandler();
      const result = await handler.handleWebhook(
        makeReq({ headers: { 'content-type': 'application/json', 'x-forge-signature': ['sha256=bad'] } } as unknown as HttpRequest),
      );
      expect(result.status).toBe(401);
    });
  });

  describe('payload parsing', () => {
    it('returns 400 for invalid JSON payload', async () => {
      mockStore.getRoute.mockResolvedValue({ routeId: 'r1', agentId: 'agent-1', name: 'Test', secret: null, isActive: true });
      const handler = makeHandler();
      const result = await handler.handleWebhook(makeReq({ bodyText: 'not json' } as unknown as string as never));
      expect(result.status).toBe(400);
      expect(result.body).toBe('Invalid JSON payload');
    });

    it('returns 400 for empty body', async () => {
      mockStore.getRoute.mockResolvedValue({ routeId: 'r1', agentId: 'agent-1', name: 'Test', secret: null, isActive: true });
      const handler = makeHandler();
      const result = await handler.handleWebhook(makeReq({ bodyText: '' } as unknown as string as never));
      expect(result.status).toBe(400);
    });
  });

  describe('event creation and notification', () => {
    it('returns 202 with eventId on success', async () => {
      mockStore.getRoute.mockResolvedValue({ routeId: 'r1', agentId: 'agent-1', name: 'GitHub', secret: null, isActive: true });
      mockStore.createEvent.mockResolvedValue({ eventId: 'event-456' });
      mockNotify.mockReturnValue(undefined);

      const handler = makeHandler();
      const result = await handler.handleWebhook(makeReq());
      expect(result.status).toBe(202);
      expect(JSON.parse(result.body as string)).toEqual({ eventId: 'event-456' });
    });

    it('stores event with agentId and routeId from route', async () => {
      mockStore.getRoute.mockResolvedValue({ routeId: 'r1', agentId: 'agent-42', name: 'Stripe', secret: null, isActive: true });
      mockStore.createEvent.mockResolvedValue({ eventId: 'e1' });
      mockNotify.mockReturnValue(undefined);

      const handler = makeHandler();
      await handler.handleWebhook(makeReq());
      expect(mockStore.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({ routeId: 'route-123', agentId: 'agent-42' }),
      );
    });

    it('extracts headers from request', async () => {
      mockStore.getRoute.mockResolvedValue({ routeId: 'r1', agentId: 'agent-1', name: 'Test', secret: null, isActive: true });
      mockStore.createEvent.mockResolvedValue({ eventId: 'e1' });
      mockNotify.mockReturnValue(undefined);

      const handler = makeHandler();
      await handler.handleWebhook(
        makeReq({ headers: { 'content-type': 'application/json', 'user-agent': 'GitHub-Hookshot', 'x-forwarded-for': '1.2.3.4' } } as HttpRequest),
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
      mockStore.getRoute.mockResolvedValue({ routeId: 'r1', agentId: 'agent-1', name: 'Test', secret: null, isActive: true });
      mockStore.createEvent.mockResolvedValue({ eventId: 'e1' });
      mockNotify.mockReturnValue(undefined);

      const handler = makeHandler();
      await handler.handleWebhook(
        makeReq({ headers: { 'content-type': 'application/json', 'x-idempotency-key': 'unique-key-123' } } as HttpRequest),
      );
      expect(mockStore.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({ idempotencyKey: 'unique-key-123' }),
      );
    });

    it('passes undefined idempotencyKey when header absent', async () => {
      mockStore.getRoute.mockResolvedValue({ routeId: 'r1', agentId: 'agent-1', name: 'Test', secret: null, isActive: true });
      mockStore.createEvent.mockResolvedValue({ eventId: 'e1' });
      mockNotify.mockReturnValue(undefined);

      const handler = makeHandler();
      await handler.handleWebhook(makeReq());
      expect(mockStore.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({ idempotencyKey: undefined }),
      );
    });

    it('sends notification after storing event', async () => {
      mockStore.getRoute.mockResolvedValue({ routeId: 'r1', agentId: 'agent-1', name: 'GitHub', secret: null, isActive: true });
      mockStore.createEvent.mockResolvedValue({ eventId: 'e1' });
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
      mockStore.getRoute.mockResolvedValue({ routeId: 'r1', agentId: 'agent-1', name: 'Test', secret: null, isActive: true });
      mockStore.createEvent.mockResolvedValue({ eventId: 'e1' });
      mockNotify.mockReturnValue(undefined);

      const handler = makeHandler();
      await handler.handleWebhook(
        makeReq({ headers: { 'content-type': 'application/json', 'x-forwarded-for': ['1.2.3.4', '5.6.7.8'] } } as unknown as HttpRequest),
      );
      expect(mockStore.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({ 'x-forwarded-for': '1.2.3.4' }),
        }),
      );
    });
  });


});