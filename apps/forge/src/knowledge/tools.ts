import { createTool } from '@forge-runtime/core';
import { z } from 'zod';
import { createKnowledgeStore } from './store';

export function createKnowledgeTools(db: Parameters<typeof createKnowledgeStore>[0], agentId: string) {
  const store = createKnowledgeStore(db);

  const add_knowledge_document = createTool({
    id: 'add_knowledge_document',
    description:
      'Add a document to the shared knowledge base. Use this to record decisions, procedures, facts, and patterns that other agents should know. The title should be clear and descriptive.',
    inputSchema: z.object({
      title: z.string().min(1).describe('Short descriptive title for the document.'),
      content: z.string().min(1).describe('Full content of the document.'),
      tags: z.array(z.string()).optional().describe('Tags to help organize and filter documents.'),
      source: z.string().optional().describe('Source of the information (e.g., "PRD-19", "meeting-notes", "engineering-decision").'),
    }),
    execute: async (input) => {
      try {
        const doc = await store.addDocument({
          title: input.title,
          content: input.content,
          ownerAgentId: agentId,
          tags: input.tags,
          source: input.source,
        });
        return { valid: true, documentId: doc.documentId, title: doc.title };
      } catch (error) {
        return { valid: false, error: error instanceof Error ? error.message : 'Failed to add document' };
      }
    },
  });

  const search_knowledge = createTool({
    id: 'search_knowledge',
    description:
      'Search the shared knowledge base by text or tag. Returns matching documents with excerpts so you can determine which ones are relevant without reading them fully.',
    inputSchema: z.object({
      query: z.string().optional().describe('Text to search for in document content.'),
      tag: z.string().optional().describe('Filter by tag.'),
      limit: z.number().int().min(1).max(20).optional().describe('Maximum results. Default 5.'),
    }),
    execute: async (input) => {
      try {
        let docs;
        if (input.tag) {
          docs = await store.searchByTag(input.tag, input.limit ?? 5);
        } else if (input.query) {
          docs = await store.searchByText(input.query, input.limit ?? 5);
        } else {
          docs = await store.listDocuments(input.limit ?? 5);
        }
        return {
          valid: true,
          results: docs.map((d) => ({
            documentId: d.documentId,
            title: d.title,
            excerpt: d.content.slice(0, 200) + (d.content.length > 200 ? '...' : ''),
            tags: d.tags,
            source: d.source,
            updatedAt: new Date(d.updatedAt).toISOString(),
          })),
        };
      } catch (error) {
        return { valid: false, error: error instanceof Error ? error.message : 'Failed to search knowledge' };
      }
    },
  });

  const read_knowledge_document = createTool({
    id: 'read_knowledge_document',
    description: 'Retrieve a full document from the knowledge base by its documentId.',
    inputSchema: z.object({
      documentId: z.string().min(1).describe('The documentId returned by search or add.'),
    }),
    execute: async (input) => {
      try {
        const doc = await store.getDocument(input.documentId);
        if (!doc) return { valid: false, error: 'Document not found' };
        return {
          valid: true,
          title: doc.title,
          content: doc.content,
          tags: doc.tags,
          source: doc.source,
          version: doc.version,
          createdAt: new Date(doc.createdAt).toISOString(),
          updatedAt: new Date(doc.updatedAt).toISOString(),
        };
      } catch (error) {
        return { valid: false, error: error instanceof Error ? error.message : 'Failed to read document' };
      }
    },
  });

  return { add_knowledge_document, search_knowledge, read_knowledge_document };
}