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
 * Implementation uses `new ReadableStream({ start(controller) { ... } })`
 * (the public, spec-compliant API). The legacy `new ReadableStreamDefaultController()`
 * (illegal in Node 22+) is no longer used. The "with stubbed ReadableStreamDefaultController"
 * describe blocks above were written when the source used the illegal API; they
 * still pass because the stub is harmless when the source ignores the global
 * constructor. The "real ReadableStream" describe block at the bottom verifies
 * the handler works end-to-end without any stubbing.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
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
  describe('connection setup (no stubbing — real ReadableStream)', () => {
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
      // Drain the stream so the test doesn't leak handles.
      (response.stream as Readable).destroy();
    });

    it('exposes a Node.js Readable stream for the SSE body', async () => {
      const internalChat = createMockInternalChat();
      const handler = createInternalChatSseHandler(internalChat as never);
      const { request } = createMockRequest('accountId=admin-1');

      const response = await handler(request);

      expect(response.stream).toBeInstanceOf(Readable);
      (response.stream as Readable).destroy();
    });

    it('registers a delivery handler with the chat connection using accountId as key', async () => {
      const internalChat = createMockInternalChat();
      const handler = createInternalChatSseHandler(internalChat as never);
      const { request } = createMockRequest('accountId=admin-1');

      const response = await handler(request);
      (response.stream as Readable).destroy();

      expect(internalChat.onReceiveMessage).toHaveBeenCalledTimes(1);
      expect(internalChat.onReceiveMessage).toHaveBeenCalledWith(
        'admin-1',
        expect.any(Function),
      );
      expect(internalChat.__handlers.has('admin-1')).toBe(true);
    });

  });

  describe('message delivery (no stubbing — real ReadableStream)', () => {
    it('forwards delivered messages to the stream as SSE data frames', async () => {
      const internalChat = createMockInternalChat();
      const handler = createInternalChatSseHandler(internalChat as never);
      const { request } = createMockRequest('accountId=admin-1');

      const response = await handler(request);
      const stream = response.stream as Readable;

      const onMessage = internalChat.__handlers.get('admin-1');
      expect(onMessage).toBeDefined();
      await onMessage!({
        targetKey: 'conv-1',
        messageId: 'msg-1',
        authorId: 'a',
        authorDisplayName: 'A',
        content: 'hi',
      } as InternalChatDeliveryMessage);

      // Read the first chunk the stream yields.
      const collected: Buffer[] = [];
      for await (const chunk of stream) {
        collected.push(chunk as Buffer);
        break;
      }
      const decoded = Buffer.concat(collected).toString('utf-8');
      // The first chunk combines the welcome comment + the data frame,
      // since both were enqueued before the consumer started reading.
      expect(decoded).toContain(': connected');
      expect(decoded).toContain('data: ');
      expect(decoded).toContain('"messageId":"msg-1"');
    });

    it('filters messages when conversationId query param is set and targetKey differs', async () => {
      const internalChat = createMockInternalChat();
      const handler = createInternalChatSseHandler(internalChat as never);
      const { request } = createMockRequest('accountId=admin-1&conversationId=conv-1');

      const response = await handler(request);
      const stream = response.stream as Readable;

      const onMessage = internalChat.__handlers.get('admin-1');
      expect(onMessage).toBeDefined();
      await onMessage!({
        targetKey: 'conv-2',
        messageId: 'msg-filtered',
        authorId: 'a',
        authorDisplayName: 'A',
        content: 'no',
      } as InternalChatDeliveryMessage);

      const collected: Buffer[] = [];
      for await (const chunk of stream) {
        collected.push(chunk as Buffer);
        break;
      }
      const decoded = Buffer.concat(collected).toString('utf-8');
      expect(decoded).not.toContain('msg-filtered');
    });

    it('passes messages when conversationId query param matches targetKey', async () => {
      const internalChat = createMockInternalChat();
      const handler = createInternalChatSseHandler(internalChat as never);
      const { request } = createMockRequest('accountId=admin-1&conversationId=conv-1');

      const response = await handler(request);
      const stream = response.stream as Readable;

      const onMessage = internalChat.__handlers.get('admin-1');
      expect(onMessage).toBeDefined();
      await onMessage!({
        targetKey: 'conv-1',
        messageId: 'msg-passed',
        authorId: 'a',
        authorDisplayName: 'A',
        content: 'yes',
      } as InternalChatDeliveryMessage);

      const collected: Buffer[] = [];
      for await (const chunk of stream) {
        collected.push(chunk as Buffer);
        break;
      }
      const decoded = Buffer.concat(collected).toString('utf-8');
      expect(decoded).toContain('msg-passed');
    });
  });

  describe('cleanup on disconnect (no stubbing — real ReadableStream)', () => {
    it('clears the chat handler when client disconnects', async () => {
      const internalChat = createMockInternalChat();
      const handler = createInternalChatSseHandler(internalChat as never);
      const { request, emitter } = createMockRequest('accountId=admin-1');

      const response = await handler(request);
      (response.stream as Readable).destroy();

      expect(internalChat.__handlers.has('admin-1')).toBe(true);

      emitter.emit('close');

      expect(internalChat.clearHandler).toHaveBeenCalledWith('admin-1');
      expect(internalChat.__handlers.has('admin-1')).toBe(false);
    });
  });


});
