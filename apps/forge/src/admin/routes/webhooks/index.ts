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
  httpServer: { registerRoute: (route: { method: string; path: string; handler: (request: HttpRequest) => Promise<HttpResponse> }) => void },
  store: ReturnType<typeof createWebhookStore>,
) {
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/webhooks/route/create',
    handler: async (request: HttpRequest) => {
      const body = parseJsonBody(request.bodyText, createRouteSchema);
      const secret = createHash('sha256').update(createId()).digest('hex').slice(0, 32);
      try {
        const route = await store.createRoute({ agentId: body.agentId, name: body.name, secret });
        return jsonResponse({ routeId: route.routeId, secret }, 201);
      } catch (err) {
        forgeDebug({ scope: 'webhooks', level: 'error', message: '[webhooks] createRoute failed', context: { error: err instanceof Error ? err.message : String(err) }});
        throw err;
      }
    },
  });

  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/webhooks/routes',
    handler: async (request: HttpRequest) => {
      const agentId = new URL(`http://localhost${request.path}${request.query.toString() ? '?' + request.query.toString() : ''}`, 'http://localhost').searchParams.get('agentId');
      if (!agentId) {
        return jsonResponse({ error: 'agentId required' }, 400);
      }
      try {
        const routes = await store.listRoutesByAgent(agentId);
        return jsonResponse({ routes: routes.map((r) => ({ routeId: r.routeId, name: r.name, isActive: r.isActive, createdAt: r.createdAt })) });
      } catch (err) {
        forgeDebug({ scope: 'webhooks', level: 'error', message: '[webhooks] listRoutes failed', context: { error: err instanceof Error ? err.message : String(err) }});
        throw err;
      }
    },
  });

  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/webhooks/route/deactivate',
    handler: async (request: HttpRequest) => {
      const body = parseJsonBody(request.bodyText, deactivateRouteSchema);
      try {
        await store.deactivateRoute(body.routeId);
        return jsonResponse({ success: true });
      } catch (err) {
        forgeDebug({ scope: 'webhooks', level: 'error', message: '[webhooks] deactivateRoute failed', context: { error: err instanceof Error ? err.message : String(err) }});
        throw err;
      }
    },
  });

  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/webhooks/events',
    handler: async (request: HttpRequest) => {
      const agentId = new URL(`http://localhost${request.path}${request.query.toString() ? '?' + request.query.toString() : ''}`, 'http://localhost').searchParams.get('agentId');
      if (!agentId) {
        return jsonResponse({ error: 'agentId required' }, 400);
      }
      try {
        const events = await store.listEventsByAgent(agentId);
        return jsonResponse({ events: events.map((e) => ({ eventId: e.eventId, routeId: e.routeId, status: e.status, receivedAt: e.receivedAt })) });
      } catch (err) {
        forgeDebug({ scope: 'webhooks', level: 'error', message: '[webhooks] listEvents failed', context: { error: err instanceof Error ? err.message : String(err) }});
        throw err;
      }
    },
  });

  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/webhooks/event/mark-processed',
    handler: async (request: HttpRequest) => {
      const body = parseJsonBody(request.bodyText, markProcessedSchema);
      try {
        await store.markProcessed(body.eventId);
        return jsonResponse({ success: true });
      } catch (err) {
        forgeDebug({ scope: 'webhooks', level: 'error', message: '[webhooks] markProcessed failed', context: { error: err instanceof Error ? err.message : String(err) }});
        throw err;
      }
    },
  });
}