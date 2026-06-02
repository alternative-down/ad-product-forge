/**
 * Drizzle relations for schema-knowledge tables.
 *
 * Extracted from schema.ts in #5337 to colocate table definitions with their relations.
 */
import { relations } from 'drizzle-orm';

import {
  agents
} from './schema-agents.js';

import {
  knowledgeDocuments
} from './schema-knowledge.js';

export const knowledgeDocumentsRelations = relations(knowledgeDocuments, ({ one }) => ({
  owner: one(agents, {
    fields: [knowledgeDocuments.ownerAgentId],
    references: [agents.id],
  }),
}));

