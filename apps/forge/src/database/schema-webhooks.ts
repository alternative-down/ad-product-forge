import {
  index,
  integer,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';
import { InferModel } from 'drizzle-orm';
import { agents } from './schema-agents.js';

export const webhookRoutes = sqliteTable(
  'webhook_routes',
  {
    routeId: text('route_id').primaryKey(),
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    // Legacy column (plain text). Retained during 0027 backfill window for
    // safe application-level lazy migration. Will be dropped in 0028 after
    // backfill audit confirms all rows have secret_encrypted populated.
    // See migration 0027 header for full context (Closes #5894).
    secret: text('secret'),
    // NEW: AES-256-GCM encrypted secret. Combined output (iv || ciphertext ||
    // authTag), base64-encoded. Decryption via decryptSecret in
    // apps/forge/src/encryption/crypto.ts (key from ENCRYPTION_KEY env).
    secretEncrypted: text('secret_encrypted'),
    // NEW: Last 4 chars of plaintext secret, for admin identification only.
    // Never used for verification or any cryptographic operation.
    secretLastFour: text('secret_last_four'),
    isActive: integer('is_active').notNull().default(1),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    webhookRoutesAgentIdIdx: index('webhook_routes_agent_id_idx').on(table.agentId),
  }),
);

export type WebhookRoute = InferModel<typeof webhookRoutes>;
export type NewWebhookRoute = InferModel<typeof webhookRoutes, 'insert'>;

export const webhookEvents = sqliteTable(
  'webhook_events',
  {
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
  },
  (table) => ({
    webhookEventsRouteIdIdx: index('webhook_events_route_id_idx').on(table.routeId),
    webhookEventsAgentIdIdx: index('webhook_events_agent_id_idx').on(table.agentId),
  }),
);

export type WebhookEvent = InferModel<typeof webhookEvents>;
export type NewWebhookEvent = InferModel<typeof webhookEvents, 'insert'>;
