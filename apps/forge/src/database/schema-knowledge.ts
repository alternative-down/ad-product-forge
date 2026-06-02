import {
  index,
  integer,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';
import { InferModel } from 'drizzle-orm';
import { agents } from './schema-agents.js';

export const knowledgeDocuments = sqliteTable(
  'knowledge_documents',
  {
    documentId: text('document_id').primaryKey(),
    title: text('title').notNull(),
    content: text('content').notNull(),
    ownerAgentId: text('owner_agent_id').references(() => agents.id, { onDelete: 'set null' }),
    source: text('source'),
    tags: text('tags'),
    version: integer('version').notNull().default(1),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    knowledgeDocumentsOwnerAgentIdIdx: index('knowledge_documents_owner_agent_id_idx').on(
      table.ownerAgentId,
    ),
  }),
);

export type KnowledgeDocument = InferModel<typeof knowledgeDocuments>;
export type NewKnowledgeDocument = InferModel<typeof knowledgeDocuments, 'insert'>;