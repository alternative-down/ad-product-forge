import { eq, like, desc } from 'drizzle-orm';
import type { Database } from '../database/index';
import { knowledgeDocuments } from '../database/schema';
import { createId } from '../utils/id';
import { forgeDebug } from '@forge-runtime/core';

export type KnowledgeDocument = typeof knowledgeDocuments.$inferSelect;
export type KnowledgeDocumentInsert = typeof knowledgeDocuments.$inferInsert;

export function createKnowledgeStore(db: Database) {
  async function addDocument(input: {
    title: string;
    content: string;
    ownerAgentId?: string;
    source?: string;
    tags?: string[];
  }): Promise<KnowledgeDocument | null> {
    const now = Date.now();
    const doc: KnowledgeDocumentInsert = {
      documentId: createId(),
      title: input.title,
      content: input.content,
      ownerAgentId: input.ownerAgentId ?? null,
      source: input.source ?? null,
      tags: input.tags ?? null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await db.insert(knowledgeDocuments).values(doc);
    } catch (err) {
      forgeDebug({
        scope: 'knowledge-store',
        level: 'error',
        message: 'addDocument DB insert failed: ' + (err instanceof Error ? err.message : String(err)),
      });
      return null;
    }

    return doc as KnowledgeDocument;
  }

  async function updateDocument(input: {
    documentId: string;
    content?: string;
    tags?: string[];
  }): Promise<KnowledgeDocument | null> {
    let rows;
    try {
      rows = await db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.documentId, input.documentId)).limit(1);
    } catch (err) {
      forgeDebug({
        scope: 'knowledge-store',
        level: 'error',
        message: 'updateDocument DB read failed: ' + (err instanceof Error ? err.message : String(err)),
      });
      return null;
    }

    if (!rows[0]) return null;
    const existing = rows[0] as KnowledgeDocument;
    const updated = {
      content: input.content ?? existing.content,
      tags: input.tags ?? existing.tags,
      version: existing.version + 1,
      updatedAt: Date.now(),
    };

    try {
      await db.update(knowledgeDocuments).set(updated).where(eq(knowledgeDocuments.documentId, input.documentId));
    } catch (err) {
      forgeDebug({
        scope: 'knowledge-store',
        level: 'error',
        message: 'updateDocument DB update failed: ' + (err instanceof Error ? err.message : String(err)),
      });
      return null;
    }

    return { ...existing, ...updated } as KnowledgeDocument;
  }

  async function getDocument(documentId: string): Promise<KnowledgeDocument | null> {
    let rows;
    try {
      rows = await db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.documentId, documentId)).limit(1);
    } catch (err) {
      forgeDebug({
        scope: 'knowledge-store',
        level: 'error',
        message: 'getDocument DB read failed: ' + (err instanceof Error ? err.message : String(err)),
      });
      return null;
    }

    return rows[0] as KnowledgeDocument ?? null;
  }

  async function searchByText(query: string, limit = 10): Promise<KnowledgeDocument[]> {
    if (!query.trim()) return [];
    const pattern = `%${query}%`;

    let rows;
    try {
      rows = await db.select().from(knowledgeDocuments).where(like(knowledgeDocuments.content, pattern)).orderBy(desc(knowledgeDocuments.updatedAt)).limit(limit);
    } catch (err) {
      forgeDebug({
        scope: 'knowledge-store',
        level: 'error',
        message: 'searchByText DB read failed: ' + (err instanceof Error ? err.message : String(err)),
      });
      return [];
    }

    return rows as KnowledgeDocument[];
  }

  async function searchByTag(tag: string, limit = 20): Promise<KnowledgeDocument[]> {
    let rows;
    try {
      rows = await db.select().from(knowledgeDocuments).where(like(knowledgeDocuments.tags, `%${tag}%`)).orderBy(desc(knowledgeDocuments.updatedAt)).limit(limit);
    } catch (err) {
      forgeDebug({
        scope: 'knowledge-store',
        level: 'error',
        message: 'searchByTag DB read failed: ' + (err instanceof Error ? err.message : String(err)),
      });
      return [];
    }

    return rows as KnowledgeDocument[];
  }

  async function listDocuments(limit = 20): Promise<KnowledgeDocument[]> {
    let rows;
    try {
      rows = await db.select().from(knowledgeDocuments).orderBy(desc(knowledgeDocuments.updatedAt)).limit(limit);
    } catch (err) {
      forgeDebug({
        scope: 'knowledge-store',
        level: 'error',
        message: 'listDocuments DB read failed: ' + (err instanceof Error ? err.message : String(err)),
      });
      return [];
    }

    return rows as KnowledgeDocument[];
  }

  async function deleteDocument(documentId: string): Promise<void> {
    try {
      await db.delete(knowledgeDocuments).where(eq(knowledgeDocuments.documentId, documentId));
    } catch (err) {
      forgeDebug({
        scope: 'knowledge-store',
        level: 'error',
        message: 'deleteDocument DB delete failed: ' + (err instanceof Error ? err.message : String(err)),
      });
    }
  }

  return { addDocument, updateDocument, getDocument, searchByText, searchByTag, listDocuments, deleteDocument };
}