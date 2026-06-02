/**
 * Unit tests for admin/routes/internal-chat/events.ts
 *
 * Covers: createInternalChatSseHandler
 *  - 400 when accountId is missing
 *  - 200 + SSE headers when accountId is present
 *  - Welcome comment enqueued
 *  - Keepalive timer registered
 *  - onReceiveMessage handler registered with the connection
 *  - Conversation filter
 *  - Cleanup on close
 *
 * Pre-existing source bug (out of scope for this PR):
 * events.ts uses `new ReadableStreamDefaultController()` directly, which is
 * an illegal constructor in Node 22+. The correct API is
 * `new ReadableStream({ start(controller) { ... } })`. We stub the constructor
 * and `Readable.fromWeb` so the rest of the code under test can be exercised.
 * The source-side fix is tracked separately.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { createInternalChatSseHandler } from './events';
import type { InternalChatService } from '../../../communication/internal-chat-service';
import type { InternalChatDeliveryMessage } from '../../../communication/internal-chat-connection';
import type { HttpRequest } from '../../../http/server';

interface MockInternalChat extends InternalChatService {
  __handlers: Map<string, (message: InternalChatDeliveryMessage) => Promise<void>>;
}

function createMockInternalChat(): MockInternalChat {
  const handlers = new Map<string, (m: InternalChatDeliveryMessage) => Promise<void>>();
  return {
    __handlers: handlers,
    onReceiveMessage: vi.fn((accountId: string, handler: (m: InternalChatDeliveryMessage) => Promise<void>) => {
      handlers.set(accountId, handler);
    }),
    clearHandler: vi.fn((accountId: string) => {
      handlers.delete(accountId);
    }),
  } as unknown as MockInternalChat;
}

function createMockRequest(queryString: string): { request: HttpRequest; emitter: EventEmitter } {
  const emitter = new EventEmitter();
  const request = {
    method: 'GET',
    path: '/admin/internal-chat/events',
    query: new URLSearchParams(queryString),
    headers: {},
    body: Buffer.from(''),
    bodyText: '',
    req: emitter as unknown as HttpRequest['req'],
  };
  return { request: request as HttpRequest, emitter };
}

interface StubbedStreamHandles {
  enqueue: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  restore: () => void;
}

function stubStreamApis(): StubbedStreamHandles {
  const enqueue = vi.fn();
  const close = vi.fn();
  const originalController = (globalThis as { ReadableStreamDefaultController?: unknown })
    .ReadableStreamDefaultController;
  const originalFromWeb = Readable.fromWeb;

  (globalThis as { ReadableStreamDefaultController?: unknown }).ReadableStreamDefaultController =
    function FakeReadableStreamDefaultController() {
      return { enqueue, close };
    };
  Readable.fromWeb = (() => new Readable({ read() {} })) as typeof Readable.fromWeb;

  return {
    enqueue,
    close,
    restore: () => {
      if (originalController === undefined) {
        delete (globalThis as { ReadableStreamDefaultController?: unknown })
          .ReadableStreamDefaultController;
      } else {
        (globalThis as { ReadableStreamDefaultController?: unknown }).ReadableStreamDefaultController =
          originalController;
      }
      Readable.fromWeb = originalFromWeb;
    },
  };
}

describe('createInternalChatSseHandler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('input validation', () => {
    it('returns 400 when accountId query param is missing', async () => {
      const internalChat = createMockInternalChat();
      const handler = createInternalChatSseHandler(internalChat as never);
      const { request } = createMockRequest('');

      const response = await handler(request);

      expect(response.status).toBe(400);
      expect(response.headers?.['content-type']).toBe('application/json');
      const parsed = JSON.parse(response.body as string);
      expect(parsed.error).toMatch(/accountId/i);
    });

    it('returns 400 when only conversationId is set (accountId still required)', async () => {
      const internalChat = createMockInternalChat();
      const handler = createInternalChatSseHandler(internalChat as never);
      const { request } = createMockRequest('conversationId=conv-1');

      const response = await handler(request);

      expect(response.status).toBe(400);
    });
  });

  describe('connection setup (with stubbed ReadableStreamDefaultController)', () => {
    let stub: StubbedStreamHandles;

    beforeEach(() => {
      stub = stubStreamApis();
    });

    afterEach(() => {
      stub.restore();
    });

    it('returns 200 with SSE headers when accountId is present', async () => {
      const internalChat = createMockInternalChat();
      const handler = createInternalChatSseHandler(internalChat as never);
      const { request } = createMockRequest('accountId=admin-1');

      const response = await handler(request);

      expect(response.status).toBe(200);
      expect(response.headers?.['content-type']).toContain('text/event-stream');
      expect(response.headers?.['cache-control']).toBe('no-store, no-cache, must-revalidate');
      expect(response.headers?.['connection']).toBe('keep-alive');
      expect(response.headers?.['x-accel-buffering']).toBe('no');
    });

    it('exposes a Node.js Readable stream for the SSE body', async () => {
      const internalChat = createMockInternalChat();
      const handler = createInternalChatSseHandler(internalChat as never);
      const { request } = createMockRequest('accountId=admin-1');

      const response = await handler(request);

      expect(response.stream).toBeInstanceOf(Readable);
    });

    it('enqueues the welcome ": connected" comment', async () => {
      const internalChat = createMockInternalChat();
      const handler = createInternalChatSseHandler(internalChat as never);
      const { request } = createMockRequest('accountId=admin-1');

      await handler(request);

      expect(stub.enqueue).toHaveBeenCalled();
      const firstCallArg = stub.enqueue.mock.calls[0]?.[0] as Uint8Array | undefined;
      expect(firstCallArg).toBeDefined();
      const decoded = new TextDecoder().decode(firstCallArg);
      expect(decoded).toContain(': connected');
    });

    it('registers a delivery handler with the chat connection using accountId as key', async () => {
      const internalChat = createMockInternalChat();
      const handler = createInternalChatSseHandler(internalChat as never);
      const { request } = createMockRequest('accountId=admin-1');

      await handler(request);

      expect(internalChat.onReceiveMessage).toHaveBeenCalledTimes(1);
      expect(internalChat.onReceiveMessage).toHaveBeenCalledWith(
        'admin-1',
        expect.any(Function),
      );
      expect(internalChat.__handlers.has('admin-1')).toBe(true);
    });

    it('schedules a 25s keepalive interval', async () => {
      const internalChat = createMockInternalChat();
      const handler = createInternalChatSseHandler(internalChat as never);
      const { request } = createMockRequest('accountId=admin-1');

      await handler(request);

      expect(vi.getTimerCount()).toBeGreaterThanOrEqual(1);
    });
  });

  describe('message delivery (with stubbed ReadableStreamDefaultController)', () => {
    let stub: StubbedStreamHandles;

    beforeEach(() => {
      stub = stubStreamApis();
    });

    afterEach(() => {
      stub.restore();
    });

    it('forwards delivered messages to the stream as SSE data frames', async () => {
      const internalChat = createMockInternalChat();
      const handler = createInternalChatSseHandler(internalChat as never);
      const { request } = createMockRequest('accountId=admin-1');

      await handler(request);

      const onMessage = internalChat.__handlers.get('admin-1');
      expect(onMessage).toBeDefined();
      await onMessage!({
        targetKey: 'conv-1',
        messageId: 'msg-1',
        authorId: 'a',
        authorDisplayName: 'A',
        content: 'hi',
      } as InternalChatDeliveryMessage);

      const allEnqueued = stub.enqueue.mock.calls
        .map((c) => new TextDecoder().decode(c[0] as Uint8Array))
        .join('');
      expect(allEnqueued).toContain('data: ');
      expect(allEnqueued).toContain('"messageId":"msg-1"');
    });

    it('filters messages when conversationId query param is set and targetKey differs', async () => {
      const internalChat = createMockInternalChat();
      const handler = createInternalChatSseHandler(internalChat as never);
      const { request } = createMockRequest('accountId=admin-1&conversationId=conv-1');

      await handler(request);

      const onMessage = internalChat.__handlers.get('admin-1');
      await onMessage!({
        targetKey: 'conv-2',
        messageId: 'msg-filtered',
        authorId: 'a',
        authorDisplayName: 'A',
        content: 'no',
      } as InternalChatDeliveryMessage);

      const allEnqueued = stub.enqueue.mock.calls
        .map((c) => new TextDecoder().decode(c[0] as Uint8Array))
        .join('');
      expect(allEnqueued).not.toContain('msg-filtered');
    });

    it('passes messages when conversationId query param matches targetKey', async () => {
      const internalChat = createMockInternalChat();
      const handler = createInternalChatSseHandler(internalChat as never);
      const { request } = createMockRequest('accountId=admin-1&conversationId=conv-1');

      await handler(request);

      const onMessage = internalChat.__handlers.get('admin-1');
      await onMessage!({
        targetKey: 'conv-1',
        messageId: 'msg-passed',
        authorId: 'a',
        authorDisplayName: 'A',
        content: 'yes',
      } as InternalChatDeliveryMessage);

      const allEnqueued = stub.enqueue.mock.calls
        .map((c) => new TextDecoder().decode(c[0] as Uint8Array))
        .join('');
      expect(allEnqueued).toContain('msg-passed');
    });
  });

  describe('cleanup on disconnect (with stubbed ReadableStreamDefaultController)', () => {
    let stub: StubbedStreamHandles;

    beforeEach(() => {
      stub = stubStreamApis();
    });

    afterEach(() => {
      stub.restore();
    });

    it('clears the chat handler when client disconnects', async () => {
      const internalChat = createMockInternalChat();
      const handler = createInternalChatSseHandler(internalChat as never);
      const { request, emitter } = createMockRequest('accountId=admin-1');

      await handler(request);

      expect(internalChat.__handlers.has('admin-1')).toBe(true);

      emitter.emit('close');

      expect(internalChat.clearHandler).toHaveBeenCalledWith('admin-1');
      expect(internalChat.__handlers.has('admin-1')).toBe(false);
    });

    it('closes the controller on disconnect', async () => {
      const internalChat = createMockInternalChat();
      const handler = createInternalChatSseHandler(internalChat as never);
      const { request, emitter } = createMockRequest('accountId=admin-1');

      await handler(request);
      emitter.emit('close');

      expect(stub.close).toHaveBeenCalled();
    });
  });
});
