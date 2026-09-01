import type { HttpRequest, HttpResponse } from '../http/server';
import { webhooksHandlerDebug } from './handler-debug';
import { errorMsg } from '../agents/error-formatting';

import {
  buildEventHeaders,
  buildNotificationContent,
  extractIdempotencyKey,
  extractRouteId,
  parseWebhookPayload,
  verifyWebhookSignature,
} from './handler-helpers';
import { HttpStatus, WebhookBody } from './http-status';

type CreateEventResult =
  | { kind: 'created'; eventId: string }
  | { kind: 'duplicate'; eventId: string };

type Store = {
  getRoute(routeId: string): Promise<WebhookRouteWithSecret | null>;
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

import type { WebhookRouteWithSecret } from './store';


export function createWebhookHandler(input: { store: Store; notifyAgent: NotifyAgent }) {
  async function handleWebhook(request: HttpRequest): Promise<HttpResponse> {
    const routeId = extractRouteId(request.path);
    if (routeId === null) {
      return { status: HttpStatus.NotFound, body: WebhookBody.RouteNotFound };
    }

    const route = await input.store.getRoute(routeId);
    if (route == null) {
      return { status: HttpStatus.NotFound, body: WebhookBody.RouteNotFound };
    }
    if (!route.isActive) {
      return { status: HttpStatus.NotFound, body: WebhookBody.RouteInactive };
    }

    // Defense-in-depth (closes #5963): require HMAC for ALL routes. A null/empty
    // secret means the route is misconfigured — fail closed with 500 rather
    // than silently accepting unsigned requests.
    if (route.secret === null || route.secret === undefined || route.secret === '') {
      webhooksHandlerDebug('error', 'Route has no secret — misconfigured, refusing request', { routeId, agentId: route.agentId });
      return { status: HttpStatus.InternalServerError, body: WebhookBody.RouteMisconfigured };
    }

    const signatureHeader =
      request.headers['x-forge-signature'] ?? request.headers['x-hub-signature-256'];
    if (signatureHeader === null || signatureHeader === undefined) {
      webhooksHandlerDebug('warn', 'Missing signature header', { routeId });
      return { status: HttpStatus.Unauthorized, body: WebhookBody.MissingSignature };
    }
    if (!verifyWebhookSignature(request.bodyText, signatureHeader, route.secret)) {
      webhooksHandlerDebug('warn', 'Invalid signature', { routeId });
      return { status: HttpStatus.Unauthorized, body: WebhookBody.InvalidSignature };
    }

    const parsed = parseWebhookPayload(request.bodyText);
    if (!parsed.ok) {
      // Issue #6161: pass the REAL error from parseWebhookPayload instead
      // of synthesizing a fake Error. The previous code discarded the
      // actual diagnostic context (e.g., position of syntax error).
      webhooksHandlerDebug('error', `parseWebhookPayload failed (${parsed.reason}): ${errorMsg(parsed.error)}`);
      return { status: HttpStatus.BadRequest, body: WebhookBody.InvalidJsonPayload };
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
      webhooksHandlerDebug('info', 'Idempotent replay — skipping notification', { routeId, eventId: result.eventId });
      return {
        status: HttpStatus.Ok,
        body: JSON.stringify({ eventId: result.eventId, deduplicated: true }),
      };
    }

    input.notifyAgent(buildNotificationContent(route, result.eventId, routeId, Date.now()));

    return { status: HttpStatus.Accepted, body: JSON.stringify({ eventId: result.eventId }) };
  }

  return { handleWebhook };
}
