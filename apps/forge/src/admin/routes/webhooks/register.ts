import { createId } from '../../../utils/id';
import { parseJsonBody, jsonResponse } from '../index';
import { z } from 'zod';
import { createWebhookStore } from '../../../webhooks/store';
import type { HttpRequest } from '../../../http/server';
import type { ForgeHttpServerAdapter } from '../../../http/server';
import { createWebhookHandler } from '../../../webhooks/handler';
import { wrapAdminRoute } from './wrap-handler';


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

const rotateRouteSecretSchema = z.object({
  routeId: z.string().min(1),
});

export function registerWebhookAdminRoutes(
  httpServer: ForgeHttpServerAdapter,
  store: ReturnType<typeof createWebhookStore>,
) {
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/webhooks/route/create',
    handler: wrapAdminRoute('/admin/webhooks/route/create', async (request) => {
      const body = parseJsonBody(request.bodyText, createRouteSchema);
      // Secret is generated inside store.createRoute using 32 random bytes
      // (256 bits) via crypto.randomBytes — see encryption/crypto.ts and
      // Closes #5894. The plaintext is returned ONCE here and never again.
      const { route, plaintextSecret } = await store.createRoute({
        agentId: body.agentId,
        name: body.name,
      });
      return jsonResponse({ routeId: route.routeId, secret: plaintextSecret }, 201);
    }),
  });

  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/webhooks/route/rotate-secret',
    handler: wrapAdminRoute('/admin/webhooks/route/rotate-secret', async (request) => {
      const body = parseJsonBody(request.bodyText, rotateRouteSecretSchema);
      const { route, plaintextSecret } = await store.rotateRouteSecret(body.routeId);
      // Plaintext returned ONCE; admin must store client-side immediately.
      // Last four is provided for identification alongside the new secret.
      return jsonResponse(
        {
          routeId: route.routeId,
          secret: plaintextSecret,
          secretLastFour: route.secretLastFour,
        },
        200,
      );
    }),
  });

  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/webhooks/routes',
    handler: wrapAdminRoute('/admin/webhooks/routes', async (request) => {
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
          // Show last-4 for identification (NEVER the full secret).
          secretLastFour: r.secretLastFour,
          createdAt: r.createdAt,
        })),
      });
    }),
  });

  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/webhooks/route/deactivate',
    handler: wrapAdminRoute('/admin/webhooks/route/deactivate', async (request) => {
      const body = parseJsonBody(request.bodyText, deactivateRouteSchema);
      await store.deactivateRoute(body.routeId);
      return jsonResponse({ success: true });
    }),
  });

  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/webhooks/events',
    handler: wrapAdminRoute('/admin/webhooks/events', async (request) => {
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
    }),
  });

  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/webhooks/event/mark-processed',
    handler: wrapAdminRoute('/admin/webhooks/event/mark-processed', async (request) => {
      const body = parseJsonBody(request.bodyText, markProcessedSchema);
      await store.markProcessed(body.eventId);
      return jsonResponse({ success: true });
    }),
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
