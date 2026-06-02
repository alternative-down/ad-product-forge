import { createHash } from 'node:crypto';
import { createId } from '../../../utils/id';
import { parseJsonBody, jsonResponse } from '../index';
import { forgeDebug } from '../debug';
import { z } from 'zod';
import type { HttpRequest } from '../../../http/server';
import { createWebhookStore } from '../../../webhooks/store';
import { createWebhookHandler } from '../../../webhooks/handler';

// Extract error message for user-facing display
function errorMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return JSON.stringify(err);
}


const createRouteSchema = z.object({
  agentId: z.string().min(1),
  name: z.string().min(1),
});

const deactivateRouteSchema = z.object({
  routeId: z.string().min(1),
});

const markProcessedSchema = z.object({
  eventId: z.string().min(1),
});

export function registerWebhookAdminRoutes(
  httpServer: any,
  store: ReturnType<typeof createWebhookStore>,
) {
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/webhooks/route/create',
    handler: async (request: HttpRequest) => {
      try {
        const body = parseJsonBody(request.bodyText, createRouteSchema);
        const secret = createHash('sha256').update(createId()).digest('hex').slice(0, 32);
        const route = await store.createRoute({ agentId: body.agentId, name: body.name, secret });
        return jsonResponse({ routeId: route.routeId, secret }, 201);
      } catch (err) {
        forgeDebug({
          scope: 'admin',
          level: 'error',
          message: 'Admin route failed: /admin/webhooks/route/create',
          context: { error: errorMsg(err) },
        });
        return jsonResponse({ error: errorMsg(err) }, 500);
      }
    },
  });

  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/webhooks/routes',
    handler: async (request: HttpRequest) => {
      try {
        const agentId = new URL(
          `http://localhost${request.path}${request.query.toString() ? '?' + request.query.toString() : ''}`,
          'http://localhost',
        ).searchParams.get('agentId');
        if (agentId === null || agentId === undefined) {
          return jsonResponse({ error: 'agentId required' }, 400);
        }
        const routes = await store.listRoutesByAgent(agentId);
        return jsonResponse({
          routes: routes.map((r) => ({
            routeId: r.routeId,
            name: r.name,
            isActive: r.isActive,
            createdAt: r.createdAt,
          })),
        });
      } catch (err) {
        forgeDebug({
          scope: 'admin',
          level: 'error',
          message: 'Admin route failed: /admin/webhooks/routes',
          context: { error: errorMsg(err) },
        });
        return jsonResponse({ error: errorMsg(err) }, 500);
      }
    },
  });

  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/webhooks/route/deactivate',
    handler: async (request: HttpRequest) => {
      try {
        const body = parseJsonBody(request.bodyText, deactivateRouteSchema);
        await store.deactivateRoute(body.routeId);
        return jsonResponse({ success: true });
      } catch (err) {
        forgeDebug({
          scope: 'admin',
          level: 'error',
          message: 'Admin route failed: /admin/webhooks/route/deactivate',
          context: { error: errorMsg(err) },
        });
        return jsonResponse({ error: errorMsg(err) }, 500);
      }
    },
  });

  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/webhooks/events',
    handler: async (request: HttpRequest) => {
      try {
        const agentId = new URL(
          `http://localhost${request.path}${request.query.toString() ? '?' + request.query.toString() : ''}`,
          'http://localhost',
        ).searchParams.get('agentId');
        if (agentId === null || agentId === undefined) {
          return jsonResponse({ error: 'agentId required' }, 400);
        }
        const events = await store.listEventsByAgent(agentId);
        return jsonResponse({
          events: events.map((e) => ({
            eventId: e.eventId,
            routeId: e.routeId,
            status: e.status,
            receivedAt: e.receivedAt,
          })),
        });
      } catch (err) {
        forgeDebug({
          scope: 'admin',
          level: 'error',
          message: 'Admin route failed: /admin/webhooks/events',
          context: { error: errorMsg(err) },
        });
        return jsonResponse({ error: errorMsg(err) }, 500);
      }
    },
  });

  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/webhooks/event/mark-processed',
    handler: async (request: HttpRequest) => {
      try {
        const body = parseJsonBody(request.bodyText, markProcessedSchema);
        await store.markProcessed(body.eventId);
        return jsonResponse({ success: true });
      } catch (err) {
        forgeDebug({
          scope: 'admin',
          level: 'error',
          message: 'Admin route failed: /admin/webhooks/event/mark-processed',
          context: { error: errorMsg(err) },
        });
        return jsonResponse({ error: errorMsg(err) }, 500);
      }
    },
  });
}

/**
 * Wires up the public webhook ingestion endpoint (POST /webhooks/:routeId)
 * and the admin webhook management routes.
 *
 * Extracted from apps/forge/src/admin/routes.ts (issue #5316) to keep
 * registerAdminRoutes focused on store wiring.
 *
 * @param input.httpServer  - HTTP server adapter
 * @param input.db          - Database handle for the webhook store
 * @param input.registry    - Internal agent registry; the webhook handler
 *                            uses registry.get(agentId).runner?.notifyExternalEvent
 *                            to push events back to running agents
 */
export function registerAdminWebhooks(input: {
  httpServer: Parameters<typeof registerWebhookAdminRoutes>[0];
  db: import('../../../database/client').Database;
  registry: import('../../../agents/internal-agent-registry').InternalAgentRegistry;
}) {
  const webhookStore = createWebhookStore(input.db);
  const webhookHandler = createWebhookHandler({
    store: webhookStore,
    notifyAgent(notification) {
      const entry = input.registry.get(notification.agentId);
      if (!entry) {
        return;
      }
      entry.runner?.notifyExternalEvent({
        type: notification.type,
        groupKey: notification.groupKey,
        idempotencyKey: notification.idempotencyKey,
        text: notification.content,
        timestamp: notification.timestamp,
      });
    },
  });

  // Public webhook endpoint: POST /webhooks/:routeId
  input.httpServer.registerRoute({
    method: 'POST',
    path: '/webhooks/:routeId',
    handler: (req: HttpRequest) => webhookHandler.handleWebhook(req),
  });

  registerWebhookAdminRoutes(input.httpServer, webhookStore);
}
