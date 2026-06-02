/**
 * Drizzle relations for schema-webhooks tables.
 *
 * Extracted from schema.ts in #5337 to colocate table definitions with their relations.
 */
import { relations } from 'drizzle-orm';

import {
  agents
} from './schema-agents.js';

import {
  webhookEvents,
  webhookRoutes
} from './schema-webhooks.js';

export const webhookRoutesRelations = relations(webhookRoutes, ({ one, many }) => ({
  agent: one(agents, {
    fields: [webhookRoutes.agentId],
    references: [agents.id],
  }),
  events: many(webhookEvents),
}));


export const webhookEventsRelations = relations(webhookEvents, ({ one }) => ({
  route: one(webhookRoutes, {
    fields: [webhookEvents.routeId],
    references: [webhookRoutes.routeId],
  }),
  agent: one(agents, {
    fields: [webhookEvents.agentId],
    references: [agents.id],
  }),
}));

