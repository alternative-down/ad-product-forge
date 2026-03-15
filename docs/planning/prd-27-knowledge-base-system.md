# PRD-27: Knowledge Base System

**Status:** Planning - Technical Design
**Date:** 2026-03-15
**Scope:** Personal developer project - KISS & YAGNI principles

---

## Executive Summary

Implement a simple knowledge base that allows agents to store and retrieve documents using semantic search (embeddings-based).

**Core Goal:** Agents can store text documents and search for relevant content by meaning, not just keywords.

---

## Problem Statement

Currently, agents cannot:
- Store and retrieve documents across conversations
- Search for knowledge by meaning (semantic search)
- Organize information for reuse

**Target Scenarios:**
1. Agent stores customer best practices and finds them later via semantic search
2. Agent uploads product documentation and retrieves relevant sections
3. Agent builds institutional knowledge that persists across conversations

---

## Key Features

### 1. Document Storage
- Store documents with metadata (title, category, date)
- Support text content (markdown, plain text)
- Basic versioning (current version + previous versions)

### 2. Semantic Search
- Convert documents to embeddings using Mastra
- Find documents by similarity to query
- Return ranked results by relevance

### 3. Knowledge Management API
```typescript
// Store document
storeDocument(input: {
  title: string;
  content: string;
  category?: string;
  metadata?: Record<string, any>;
}): Promise<{ documentId: string; }>;

// Search documents
searchDocuments(query: string, limit?: number): Promise<Array<{
  documentId: string;
  title: string;
  content: string;
  similarity: number;
}>>;

// List documents
listDocuments(category?: string): Promise<Array<{
  documentId: string;
  title: string;
  category?: string;
}>>;

// Delete document
deleteDocument(documentId: string): Promise<{ success: boolean; }>;
```

---

## Database Schema

**knowledge_base_documents**
```
- documentId (TEXT, PRIMARY KEY)
- title (TEXT, NOT NULL)
- content (TEXT, NOT NULL)
- category (TEXT)
- embedding (BLOB)  -- stored embeddings
- createdAt (TEXT, NOT NULL)
- updatedAt (TEXT, NOT NULL)
- metadata (TEXT)   -- JSON
```

**knowledge_base_document_versions**
```
- versionId (TEXT, PRIMARY KEY)
- documentId (TEXT, FOREIGN KEY)
- content (TEXT)
- createdAt (TEXT)
- metadata (TEXT)
```

---

## Implementation

### Phase 1: Core (2 weeks)
- [ ] Document storage and retrieval
- [ ] Embedding generation using Mastra
- [ ] Basic semantic search
- [ ] Agent API integration
- [ ] Simple versioning

### Phase 2: Enhancement (Future)
- [ ] Full-text search (BM25)
- [ ] Hybrid search (semantic + keyword)
- [ ] Document categories and organization
- [ ] Bulk import/export

---

## Success Criteria

- [ ] Agent can store documents
- [ ] Agent can search and retrieve relevant documents by meaning
- [ ] Embeddings are generated and stored
- [ ] Simple versioning works
- [ ] API is accessible from agent tools

---

## Risks

- Embedding quality depends on Mastra service
- Large documents may be slow to embed
- Vector storage in SQLite may not scale (can migrate to vector DB later)

---

## Future Enhancements

- Hybrid search (BM25 + semantic)
- GraphRAG for relationship-aware discovery
- Document categories and hierarchies
- Bulk import from files
- Integration with ERP systems
