/**
 * Drizzle relations for schema-tickets tables.
 *
 * Extracted from schema.ts in #5337 to colocate table definitions with their relations.
 */
import { relations } from 'drizzle-orm';

import {
  ticketMessages,
  tickets
} from './schema-tickets.js';

export const ticketsRelations = relations(tickets, ({ one: _one, many }) => ({
  messages: many(ticketMessages),
}));


export const ticketMessagesRelations = relations(ticketMessages, ({ one }) => ({
  ticket: one(tickets, {
    fields: [ticketMessages.ticketId],
    references: [tickets.id],
  }),
}));

