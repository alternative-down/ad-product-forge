import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  index,
} from 'drizzle-orm/sqlite-core';
import { InferModel } from 'drizzle-orm';

export const tickets = sqliteTable(
  'forge_tickets',
  {
    id: text('id').primaryKey(),
    productId: text('product_id').notNull(),
    agentId: text('agent_id').notNull(),
    subject: text('subject').notNull(),
    status: text('status').notNull().default('open'),
    priority: text('priority').notNull().default('medium'),
    externalId: text('external_id'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    resolvedAt: integer('resolved_at'),
  },
  (table) => ({
    ticketsProductIdx: index('forge_tickets_product_idx').on(table.productId),
    ticketsAgentIdx: index('forge_tickets_agent_idx').on(table.agentId),
    ticketsStatusIdx: index('forge_tickets_status_idx').on(table.status),
    ticketsExternalIdIdx: uniqueIndex('forge_tickets_external_id_idx').on(table.externalId),
  }),
);

export type Ticket = InferModel<typeof tickets>;
export type NewTicket = InferModel<typeof tickets, 'insert'>;

export const ticketMessages = sqliteTable(
  'forge_ticket_messages',
  {
    id: text('id').primaryKey(),
    ticketId: text('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    authorType: text('author_type').notNull(),
    authorAgentId: text('author_agent_id'),
    content: text('content').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    ticketMessagesTicketIdx: index('forge_ticket_messages_ticket_idx').on(table.ticketId),
    ticketMessagesCreatedAtIdx: index('forge_ticket_messages_created_at_idx').on(table.createdAt),
    ticketMessagesUpdatedAtIdx: index('forge_ticket_messages_updated_at_idx').on(table.updatedAt),
  }),
);

export type TicketMessage = InferModel<typeof ticketMessages>;
export type NewTicketMessage = InferModel<typeof ticketMessages, 'insert'>;