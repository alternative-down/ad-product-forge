import type { HttpRequest, HttpResponse } from '../http/server';
import { forgeDebug } from '@forge-runtime/core';
import { errorMsg } from '../agents/error-formatting';

import {
  buildEventHeaders,
  buildNotificationContent,
  extractIdempotencyKey,
  extractRouteId,
  parseWebhookPayload,
  verifyWebhookSignature,
} from './handler-helpers';

type CreateEventResult =
  | { kind: 'created'; eventId: string }
  | { kind: 'duplicate'; eventId: string };

type Store = {
  getRoute(routeId: string): Promise<WebhookRoute | null>;
  createEvent(input: {
    routeId: string;
    agentId: string;
    payload: Record<string, unknown>;
    headers: Record<string, string>;
    idempotencyKey?: string;
  }): Promise<CreateEventResult>;
};

type NotifyAgent = (input: {
  agentId: string;
  content: string;
  groupKey: string;
  type: string;
  idempotencyKey: string;
  timestamp: number;
}) => void;

import type { WebhookRoute } from '../database/schema';

export function createWebhookHandler(input: { store: Store; notifyAgent: NotifyAgent }) {
  async function handleWebhook(request: HttpRequest): Promise<HttpResponse> {
    const routeId = extractRouteId(request.path);
    if (routeId === null) {
      return { status: 404, body: 'Route not found' };
    }

    const route = await input.store.getRoute(routeId);
    if (route == null) {
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
      if (!verifyWebhookSignature(request.bodyText, signatureHeader, route.secret)) {
        forgeDebug({
          scope: 'webhooks-handler',
          level: 'warn',
          message: 'Invalid signature',
          context: { routeId },
        });
        return { status: 401, body: 'Invalid signature' };
      }
    }

    const parsed = parseWebhookPayload(request.bodyText);
    if (!parsed.ok) {
      forgeDebug({
        scope: 'webhooks-handler',
        level: 'error',
        message: 'parseWebhookPayload failed: ' + errorMsg(new Error('invalid JSON')),
      });
      return { status: 400, body: 'Invalid JSON payload' };
    }

    const result = await input.store.createEvent({
      routeId,
      agentId: route.agentId,
      payload: parsed.payload,
      headers: buildEventHeaders(request),
      idempotencyKey: extractIdempotencyKey(request),
    });

    // AC-5: duplicate request is NOT an error — return 200 with deduplicated flag.
    // Notification is SKIPPED (design decision: avoid duplicate agent notifications;
    // the first call already notified).
    if (result.kind === 'duplicate') {
      forgeDebug({
        scope: 'webhooks-handler',
        level: 'info',
        message: 'Idempotent replay — skipping notification',
        context: { routeId, eventId: result.eventId },
      });
      return {
        status: 200,
        body: JSON.stringify({ eventId: result.eventId, deduplicated: true }),
      };
    }

    input.notifyAgent(buildNotificationContent(route, result.eventId, routeId, Date.now()));

    return { status: 202, body: JSON.stringify({ eventId: result.eventId }) };
  }

  return { handleWebhook };
}
