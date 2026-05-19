/**
 * SSE Events endpoint for internal chat real-time delivery.
 * Bridges InternalChatConnection.onReceiveMessage → client via Server-Sent Events.
 *
 * Route: GET /admin/internal-chat/events
 * Query params:
 *   - accountId      (required) — admin account id
 *   - conversationId (optional) — if set, only delivers messages for this conversation
 *
 * Security: requires X-FORGE-ADMIN-API-KEY header (enforced by http/server.ts).
 */
import type http from 'node:http';
import { Readable } from 'node:stream';

import type { HttpHandler, HttpResponse } from '../../../http/server';
import type { InternalChatService } from '../../../communication/internal-chat-service';
import type { InternalChatDeliveryMessage } from '../../../communication/internal-chat-connection';
import { forgeDebug } from '../debug';

const SCOPE = 'admin-sse-events';

/** Keep-alive comment sent every 25 s to prevent proxy connection timeouts. */
const KEEPALIVE_INTERVAL_MS = 25_000;

export function createInternalChatSseHandler(
  internalChat: InternalChatService,
): HttpHandler {
  return async function handleSseEvents(request): Promise<HttpResponse> {
    const accountId = request.query.get('accountId');
    if (accountId === null || accountId === undefined) {
      return {
        status: 400,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: 'accountId query param is required' }),
      };
    }

    const conversationId = request.query.get('conversationId') ?? null;

    const controller = new ReadableStreamDefaultController();
    // Convert the Web ReadableStream into a Node.js Readable so http.ServerResponse.pipe()
    // can consume it. ReadableStreamDefaultController is available in lib: ES2022 + WebStreams.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodeStream = Readable.fromWeb(controller as any);

    // Send a welcome comment so the client can confirm the connection before the first event.
    controller.enqueue(new TextEncoder().encode(': connected\n\n'));

    // Prevent proxies / load balancers from closing the idle connection.
    const keepaliveTimer = setInterval(() => {
      try {
        controller.enqueue(new TextEncoder().encode(': ping\n\n'));
      } catch {
        // Controller already closed — ignore.
      }
    }, KEEPALIVE_INTERVAL_MS);

    // Register a delivery handler with the connection.
    // Admin accounts have agentId=null so we use accountId as the handler key.
    internalChat.onReceiveMessage(accountId, async (message: InternalChatDeliveryMessage) => {
      if (conversationId !== null && message.targetKey !== conversationId) {
        return;
      }

      try {
        const payload = `data: ${JSON.stringify(message)}\n\n`;
        controller.enqueue(new TextEncoder().encode(payload));
      } catch {
        // Controller closed — client disconnected; handler will be cleaned
        // up when 'close' fires on the raw request.
      }
    });

    // Clean up on client disconnect.
    request.req.on('close', () => {
      clearInterval(keepaliveTimer);
      try {
        controller.close();
      } catch {
        // Already closed.
      }
      internalChat.clearHandler(accountId);
      forgeDebug({
        scope: SCOPE,
        level: 'debug',
        message: 'SSE client disconnected',
        context: { accountId, conversationId },
      });
    });

    return {
      status: 200,
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-store, no-cache, must-revalidate',
        'connection': 'keep-alive',
        'x-accel-buffering': 'no', // prevent nginx from buffering SSE
      },
      stream: nodeStream,
    };
  };
}