import { createHash, timingSafeEqual } from 'node:crypto';
import type { HttpRequest, HttpResponse } from '../http/server';
import { forgeDebug } from '@forge-runtime/core';

type Store = {
  getRoute(
    routeId: string,
  ): Promise<{
    routeId: string;
    agentId: string;
    name: string;
    secret: string | null;
    isActive: boolean;
  } | null>;
  createEvent(input: {
    routeId: string;
    agentId: string;
    payload: Record<string, unknown>;
    headers: Record<string, string>;
    idempotencyKey?: string;
  }): Promise<{ eventId: string }>;
};

type NotifyAgent = (input: {
  agentId: string;
  content: string;
  groupKey: string;
  type: string;
  idempotencyKey: string;
  timestamp: number;
}) => void;

export function createWebhookHandler(input: { store: Store; notifyAgent: NotifyAgent }) {
  async function handleWebhook(request: HttpRequest): Promise<HttpResponse> {
    const match = request.path.match(/^\/webhooks\/([^/]+)$/);
    if (!match) {
      return { status: 404, body: 'Route not found' };
    }
    const routeId = match[1];

    const route = await input.store.getRoute(routeId);
    if (!route) {
      return { status: 404, body: 'Route not found' };
    }
    if (!route.isActive) {
      return { status: 404, body: 'Route inactive' };
    }

    if (route.secret !== null && route.secret !== undefined) {
      const signatureHeader =
        request.headers['x-forge-signature'] ?? request.headers['x-hub-signature-256'];
      if (signatureHeader === null || signatureHeader === undefined) {
        forgeDebug({
          scope: 'webhooks',
          level: 'warn',
          message: 'Missing signature header',
          context: { routeId },
        });
        return { status: 401, body: 'Missing signature' };
      }
      const rawBody = request.bodyText;
      const expected = 'sha256=' + createHash('sha256').update(rawBody).digest('hex');
      const received = typeof signatureHeader === 'string' ? signatureHeader : signatureHeader[0];
      try {
        const a = Buffer.from(expected);
        const b = Buffer.from(received);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return { status: 401, body: 'Invalid signature' };
        }
      } catch {
        return { status: 401, body: 'Invalid signature' };
      }
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(request.bodyText);
    } catch {
      return { status: 400, body: 'Invalid JSON payload' };
    }

    const event = await input.store.createEvent({
      routeId,
      agentId: route.agentId,
      payload,
      headers: {
        'content-type': request.headers['content-type'] ?? '',
        'user-agent': request.headers['user-agent'] ?? '',
        'x-forwarded-for': Array.isArray(request.headers['x-forwarded-for'])
          ? request.headers['x-forwarded-for'][0]
          : (request.headers['x-forwarded-for'] ?? ''),
      } as Record<string, string>,
      idempotencyKey:
        typeof request.headers['x-idempotency-key'] === 'string'
          ? request.headers['x-idempotency-key']
          : undefined,
    });

    input.notifyAgent({
      agentId: route.agentId,
      content: `[Webhook] Event received on route "${route.name}" (${routeId}). Event ID: ${event.eventId}`,
      groupKey: `webhook:${event.eventId}`,
      type: 'webhook',
      idempotencyKey: `webhook:${event.eventId}`,
      timestamp: Date.now(),
    });

    return { status: 202, body: JSON.stringify({ eventId: event.eventId }) };
  }

  return { handleWebhook };
}
