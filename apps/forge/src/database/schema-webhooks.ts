import {
  integer,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';
import { InferModel } from 'drizzle-orm';
import { agents } from './schema-agents.js';

export const webhookRoutes = sqliteTable('webhook_routes', {
  routeId: text('route_id').primaryKey(),
  agentId: text('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  secret: text('secret'),
  isActive: integer('is_active').notNull().default(1),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type WebhookRoute = InferModel<typeof webhookRoutes>;
export type NewWebhookRoute = InferModel<typeof webhookRoutes, 'insert'>;

export const webhookEvents = sqliteTable('webhook_events', {
  eventId: text('event_id').primaryKey(),
  routeId: text('route_id')
    .notNull()
    .references(() => webhookRoutes.routeId, { onDelete: 'cascade' }),
  agentId: text('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  payload: text('payload').notNull(),
  headers: text('headers').notNull(),
  idempotencyKey: text('idempotency_key'),
  status: text('status').notNull().default('pending'),
  receivedAt: integer('received_at').notNull(),
  processedAt: integer('processed_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type WebhookEvent = InferModel<typeof webhookEvents>;
export type NewWebhookEvent = InferModel<typeof webhookEvents, 'insert'>;