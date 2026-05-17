/**
 * Webhook Routes — extracted from admin/routes.ts (#4303)
 *
 * Handles:
 *   POST /webhooks/:routeId  (public inbound webhook)
 *
 * Note: webhookHandler closure uses registry.get() so registerWebhookRoutes
 * requires the registry as a dependency. Admin management routes are
 * registered by the caller (routes.ts) to avoid circular dependency.
 */

import { createWebhookStore } from '../../webhooks/store';
import { createWebhookHandler } from '../../webhooks/handler';
import type { ForgeHttpServerAdapter } from '../../http/server';
import type { InternalAgentRegistry } from '../../agents/internal-agent-registry';
import type { Database } from '../../database/client';

export interface WebhookRoutesDeps {
  httpServer: ForgeHttpServerAdapter;
  db: Database;
  registry: InternalAgentRegistry;
}

export function registerWebhookRoutes({ httpServer, db, registry }: WebhookRoutesDeps) {
  const webhookStore = createWebhookStore(db);

  const webhookHandler = createWebhookHandler({
    store: webhookStore as any,
    notifyAgent(input) {
      const entry = registry.get(input.agentId);
      if (!entry) { return; }
      entry.runner.notifyExternalEvent({
        type: input.type,
        groupKey: input.groupKey,
        idempotencyKey: input.idempotencyKey,
        text: input.content,
        timestamp: input.timestamp,
      });
    },
  });

  // Public webhook endpoint: POST /webhooks/:routeId
  httpServer.registerRoute({
    method: 'POST',
    path: '/webhooks/:routeId',
    handler: (req) => webhookHandler.handleWebhook(req),
  });
}