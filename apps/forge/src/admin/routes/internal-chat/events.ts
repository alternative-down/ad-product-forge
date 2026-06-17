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
import { Readable } from 'node:stream';

import type { HttpHandler, HttpResponse } from '../../../http/server';
import type { InternalChatService } from '../../../communication/internal-chat-service';
import type { InternalChatDeliveryMessage } from '../../../communication/internal-chat-connection';
import { forgeDebug } from '../debug';
import { TWENTY_FIVE_SECONDS_MS } from '../../../agents/time-constants';

const SCOPE = 'admin-sse-events';

/** Keep-alive comment sent every 25 s to prevent proxy connection timeouts. */
const KEEPALIVE_INTERVAL_MS = TWENTY_FIVE_SECONDS_MS;

export function createInternalChatSseHandler(internalChat: InternalChatService): HttpHandler {
    // eslint-disable-next-line @typescript-eslint/require-await
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

    // The Web ReadableStream exposes its controller to the start() callback
    // only. We hold a closure-scoped reference so external callbacks
    // (delivery handler, keepalive timer, raw 'close' event) can enqueue
    // and close the stream. ReadableStreamDefaultController cannot be
    // constructed directly (it's an internal class of the runtime).
    let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
    let keepaliveTimer: NodeJS.Timeout | null = null;

    const webStream = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
        // Send a welcome comment so the client can confirm the connection
        // before the first event.
        controller.enqueue(new TextEncoder().encode(': connected\n\n'));
        // Prevent proxies / load balancers from closing the idle connection.
        keepaliveTimer = setInterval(() => {
          if (controller === null) {
            return;
          }
          try {
            controller.enqueue(new TextEncoder().encode(': ping\n\n'));
          } catch {
            // Controller already closed — ignore.
          }
        }, KEEPALIVE_INTERVAL_MS);
      },
      cancel() {
        // The consumer stopped reading. This fires for both transient
        // backpressure and for true client disconnects. We only stop the
        // keepalive timer here; the request.req.on('close') handler below
        // is the authoritative point for clearing the chat handler and
        // closing the controller (it also handles the disconnect case
        // when the consumer doesn't actually call cancel).
        if (keepaliveTimer !== null) {
          clearInterval(keepaliveTimer);
          keepaliveTimer = null;
        }
      },
    });

    const nodeStream = Readable.fromWeb(webStream as never);

    // Register a delivery handler with the connection.
    // Admin accounts have agentId=null so we use accountId as the handler key.
    internalChat.onReceiveMessage(accountId, async (message: InternalChatDeliveryMessage) => {
      if (controller === null) {
        return;
      }
      if (conversationId !== null && message.targetKey !== conversationId) {
        return;
      }

      try {
        const payload = `data: ${JSON.stringify(message)}\n\n`;
        controller.enqueue(new TextEncoder().encode(payload));
        await Promise.resolve();
      } catch {
        // Controller closed — client disconnected; handler will be cleaned
        // up when 'close' fires on the raw request.
      }
    });

    // Clean up on client disconnect.
    request.req.on('close', () => {
      if (keepaliveTimer !== null) {
        clearInterval(keepaliveTimer);
        keepaliveTimer = null;
      }
      try {
        controller?.close();
      } catch {
        // Already closed.
      }
      controller = null;
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
        connection: 'keep-alive',
        'x-accel-buffering': 'no', // prevent nginx from buffering SSE
      },
      stream: nodeStream,
    };
  };
}
