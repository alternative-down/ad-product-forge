import { createHash } from 'node:crypto';
import { createId } from '../../../utils/id';
import { parseJsonBody, jsonResponse } from '../helpers';
import { forgeDebug } from '@forge-runtime/core';
import { z } from 'zod';
import type { HttpRequest } from '../../http/server';
import type { createWebhookStore } from '../../../webhooks/store';

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
  httpServer: { registerRoute: (route: { method: string; path: string; handler: (request: HttpRequest) => Promise<unknown> }) => void },
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
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Admin route failed: /admin/webhooks/route/create', context: { error } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/webhooks/routes',
    handler: async (request: HttpRequest) => {
      try {
        const agentId = new URL(`http://localhost${request.path}${request.query.toString() ? '?' + request.query.toString() : ''}`, 'http://localhost').searchParams.get('agentId');
        if (!agentId) {
          return jsonResponse({ error: 'agentId required' }, 400);
        }
        const routes = await store.listRoutesByAgent(agentId);
        return jsonResponse({ routes: routes.map((r) => ({ routeId: r.routeId, name: r.name, isActive: r.isActive, createdAt: r.createdAt })) });
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Admin route failed: /admin/webhooks/routes', context: { error } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
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
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Admin route failed: /admin/webhooks/route/deactivate', context: { error } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/webhooks/events',
    handler: async (request: HttpRequest) => {
      try {
        const agentId = new URL(`http://localhost${request.path}${request.query.toString() ? '?' + request.query.toString() : ''}`, 'http://localhost').searchParams.get('agentId');
        if (!agentId) {
          return jsonResponse({ error: 'agentId required' }, 400);
        }
        const events = await store.listEventsByAgent(agentId);
        return jsonResponse({ events: events.map((e) => ({ eventId: e.eventId, routeId: e.routeId, status: e.status, receivedAt: e.receivedAt })) });
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Admin route failed: /admin/webhooks/events', context: { error } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
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
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Admin route failed: /admin/webhooks/event/mark-processed', context: { error } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });
}
