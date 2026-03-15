# PRD-27: Knowledge Base System

**Status:** Planning - Technical Design
**Date:** 2026-03-15
**Scope:** Personal developer project - KISS & YAGNI principles

---

## Executive Summary

### Classification: AD-PRODUCT-FORGE APPLICATION

**This PRD describes knowledge management infrastructure specific to ad-product-forge.** Knowledge base enables Nicolas' agents to build institutional memory and search by meaning. This is application-specific, not framework infrastructure.

Implement a simple knowledge base that allows agents to store and retrieve documents using semantic search (embeddings-based).

**Core Goal (for ad-product-forge):** Agents can store text documents and search for relevant content by meaning, not just keywords. Enables research agents to build knowledge over time.

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
- Store documents with title and content
- Support text content (markdown, plain text)

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
}): Promise<{ documentId: string; }>;

// Search documents
searchDocuments(query: string, limit?: number): Promise<Array<{
  documentId: string;
  title: string;
  content: string;
  similarity: number;
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
- embedding (BLOB)  -- stored embeddings
- createdAt (TEXT, NOT NULL)
```

---

## Implementation

### Phase 1: Core (2 weeks)
- [ ] Document storage and retrieval
- [ ] Embedding generation using Mastra
- [ ] Basic semantic search
- [ ] Agent API integration

### Phase 2: Enhancement (Future)
- [ ] Full-text search (BM25)
- [ ] Hybrid search (semantic + keyword)

---

## Success Criteria

- [ ] Agent can store documents
- [ ] Agent can search and retrieve relevant documents by meaning
- [ ] Embeddings are generated and stored
- [ ] API is accessible from agent tools

---

## Risks

- Embedding quality depends on Mastra service
- Large documents may be slow to embed
- Vector storage in SQLite may not scale (can migrate to vector DB later)

---

## Future Enhancements

- Hybrid search (BM25 + semantic)
- Bulk import from files
