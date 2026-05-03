import { eq, and, like, desc } from 'drizzle-orm';
import type { Database } from '../database/index';
import { knowledgeDocuments } from '../database/schema';
import { createId } from '../utils/id';

export type KnowledgeDocument = typeof knowledgeDocuments.$inferSelect;
export type KnowledgeDocumentInsert = typeof knowledgeDocuments.$inferInsert;

export function createKnowledgeStore(db: Database) {
  async function addDocument(input: {
    title: string;
    content: string;
    ownerAgentId?: string;
    source?: string;
    tags?: string[];
  }): Promise<KnowledgeDocument> {
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
    await db.insert(knowledgeDocuments).values(doc);
    return doc as KnowledgeDocument;
  }

  async function updateDocument(input: {
    documentId: string;
    content?: string;
    tags?: string[];
  }): Promise<KnowledgeDocument | null> {
    const rows = await db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.documentId, input.documentId)).limit(1);
    if (!rows[0]) return null;
    const existing = rows[0] as KnowledgeDocument;
    const updated = {
      content: input.content ?? existing.content,
      tags: input.tags ?? existing.tags,
      version: existing.version + 1,
      updatedAt: Date.now(),
    };
    await db.update(knowledgeDocuments).set(updated).where(eq(knowledgeDocuments.documentId, input.documentId));
    return { ...existing, ...updated } as KnowledgeDocument;
  }

  async function getDocument(documentId: string): Promise<KnowledgeDocument | null> {
    const rows = await db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.documentId, documentId)).limit(1);
    return rows[0] as KnowledgeDocument ?? null;
  }

  async function searchByText(query: string, limit = 10): Promise<KnowledgeDocument[]> {
    if (!query.trim()) return [];
    const pattern = `%${query}%`;
    const rows = await db.select().from(knowledgeDocuments).where(like(knowledgeDocuments.content, pattern)).orderBy(desc(knowledgeDocuments.updatedAt)).limit(limit);
    return rows as KnowledgeDocument[];
  }

  async function searchByTag(tag: string, limit = 20): Promise<KnowledgeDocument[]> {
    const rows = await db.select().from(knowledgeDocuments).where(like(knowledgeDocuments.tags, `%${tag}%`)).orderBy(desc(knowledgeDocuments.updatedAt)).limit(limit);
    return rows as KnowledgeDocument[];
  }

  async function listDocuments(limit = 20): Promise<KnowledgeDocument[]> {
    return await db.select().from(knowledgeDocuments).orderBy(desc(knowledgeDocuments.updatedAt)).limit(limit) as KnowledgeDocument[];
  }

  async function deleteDocument(documentId: string): Promise<void> {
    await db.delete(knowledgeDocuments).where(eq(knowledgeDocuments.documentId, documentId));
  }

  return { addDocument, updateDocument, getDocument, searchByText, searchByTag, listDocuments, deleteDocument };
}