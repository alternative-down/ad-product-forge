import { describe, expect, it, vi, beforeEach } from 'vitest';
import { registerAgentOperationRoutes } from './operations';

function parseBody(response: any) {
  return JSON.parse(response.body);
}

function createMockRegistry() {
  return new Map<string, { runner: { notifyExternalEvent: ReturnType<typeof vi.fn> } }>();
}

function createMockHttpServer() {
  const routes: any[] = [];
  return {
    registerRoute: vi.fn((route) => routes.push(route)),
    _routes: routes,
  };
}

function createMockInternalChat() {
  return {
    registerExternalAccount: vi.fn().mockResolvedValue({ accountId: 'account-123' }),
    sendMessage: vi.fn().mockResolvedValue({
      valid: true,
      data: {
        success: true,
        conversationKey: 'conv-456',
        messageId: 'msg-789',
      },
    }),
  };
}

describe('registerAgentOperationRoutes', () => {
  let httpServer: ReturnType<typeof createMockHttpServer>;
  let registry: ReturnType<typeof createMockRegistry>;
  let internalChat: ReturnType<typeof createMockInternalChat>;

  beforeEach(() => {
    httpServer = createMockHttpServer();
    registry = createMockRegistry();
    internalChat = createMockInternalChat();
    vi.clearAllMocks();
  });

  it('registers POST /admin/agent/wake route', () => {
    registerAgentOperationRoutes(httpServer, { internalChat }, registry as any);
    const wakeRoute = httpServer._routes.find((r: any) => r.path === '/admin/agent/wake');
    expect(wakeRoute).toBeDefined();
    expect(wakeRoute.method).toBe('POST');
  });

  it('registers POST /admin/agent/internal-chat/send route', () => {
    registerAgentOperationRoutes(httpServer, { internalChat }, registry as any);
    const chatRoute = httpServer._routes.find(
      (r: any) => r.path === '/admin/agent/internal-chat/send',
    );
    expect(chatRoute).toBeDefined();
    expect(chatRoute.method).toBe('POST');
  });

  describe('wake handler', () => {
    it('returns 404 when agent not found in registry', async () => {
      registerAgentOperationRoutes(httpServer, { internalChat }, registry as any);
      const route = httpServer._routes.find((r: any) => r.path === '/admin/agent/wake');
      const response = await route.handler({
        bodyText: JSON.stringify({ agentId: 'unknown-agent' }),
      });
      expect(response.status).toBe(404);
      expect(parseBody(response).error).toContain('unknown-agent');
    });

    it('returns success when agent found and event dispatched', async () => {
      const notifyMock = vi.fn();
      registry.set('agent-123', { runner: { notifyExternalEvent: notifyMock } });
      registerAgentOperationRoutes(httpServer, { internalChat }, registry as any);
      const route = httpServer._routes.find((r: any) => r.path === '/admin/agent/wake');
      const response = await route.handler({ bodyText: JSON.stringify({ agentId: 'agent-123' }) });
      expect(response.status).toBe(200);
      expect(parseBody(response).success).toBe(true);
    });

    it('dispatches event with correct shape', async () => {
      const notifyMock = vi.fn();
      registry.set('agent-abc', { runner: { notifyExternalEvent: notifyMock } });
      registerAgentOperationRoutes(httpServer, { internalChat }, registry as any);
      const route = httpServer._routes.find((r: any) => r.path === '/admin/agent/wake');
      await route.handler({ bodyText: JSON.stringify({ agentId: 'agent-abc' }) });
      expect(notifyMock).toHaveBeenCalledTimes(1);
      const event = notifyMock.mock.calls[0][0];
      expect(event.type).toBe('manual-wake');
      expect(event.groupKey).toBe('manual-wake:agent-abc');
      expect(event.groupMetadata.Source).toBe('admin-console');
      expect(event.idempotencyKey).toMatch(/^manual-wake:agent-abc:\d+$/);
    });
  });

  describe('internal-chat send handler', () => {
    it('registers external sender account before sending message', async () => {
      registerAgentOperationRoutes(httpServer, { internalChat }, registry as any);
      const route = httpServer._routes.find(
        (r: any) => r.path === '/admin/agent/internal-chat/send',
      );
      await route.handler({
        bodyText: JSON.stringify({
          agentId: 'agent-123',
          senderSlug: 'admin-1',
          senderDisplayName: 'Admin User',
          content: 'Hello agent',
          targetKey: 'agent-123',
        }),
      });
      expect(internalChat.registerExternalAccount).toHaveBeenCalledWith({
        slug: 'admin-1',
        displayName: 'Admin User',
      });
    });

    it('sends message using registered account', async () => {
      registerAgentOperationRoutes(httpServer, { internalChat }, registry as any);
      const route = httpServer._routes.find(
        (r: any) => r.path === '/admin/agent/internal-chat/send',
      );
      await route.handler({
        bodyText: JSON.stringify({
          agentId: 'agent-123',
          senderSlug: 'admin-1',
          senderDisplayName: 'Admin User',
          content: 'Hello agent',
        }),
      });
      expect(internalChat.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 'account-123',
          targetKey: 'agent-123',
          content: 'Hello agent',
          attachments: [],
        }),
      );
    });

    it('uses agentId as targetKey when targetKey not provided', async () => {
      registerAgentOperationRoutes(httpServer, { internalChat }, registry as any);
      const route = httpServer._routes.find(
        (r: any) => r.path === '/admin/agent/internal-chat/send',
      );
      await route.handler({
        bodyText: JSON.stringify({
          agentId: 'my-agent',
          senderSlug: 'admin-1',
          senderDisplayName: 'Admin',
          content: 'Ping',
        }),
      });
      const sent = internalChat.sendMessage.mock.calls[0][0];
      expect(sent.targetKey).toBe('my-agent');
    });

    it('returns success response with conversation and message IDs', async () => {
      registerAgentOperationRoutes(httpServer, { internalChat }, registry as any);
      const route = httpServer._routes.find(
        (r: any) => r.path === '/admin/agent/internal-chat/send',
      );
      const response = await route.handler({
        bodyText: JSON.stringify({
          agentId: 'agent-123',
          senderSlug: 'admin-1',
          senderDisplayName: 'Admin',
          content: 'Test message',
        }),
      });
      expect(response.status).toBe(200);
      const body = parseBody(response);
      expect(body.success).toBe(true);
      expect(body.conversationKey).toBe('conv-456');
      expect(body.messageId).toBe('msg-789');
    });
  });
});
