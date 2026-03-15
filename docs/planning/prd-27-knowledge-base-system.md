# PRD-27: Knowledge Base System

**Status:** Planning - Technical Specification Phase

**Date:** 2026-03-15

**Owner:** Product Team

**Related Features:**
- Long-Term Memory (agent memory foundation)
- Research as Workflow (knowledge retrieval integration)
- ERP Integration (external knowledge source)
- Agent Hiring Workflow (specialist agents access KB)

---

## 1. Executive Summary

Implement a centralized Knowledge Base System that enables semantic search, hybrid retrieval, and graph-based knowledge discovery across the platform. The system integrates with the ERP data layer, uses Mastra workspace for embedding generation, and provides agents with long-term knowledge retrieval capabilities similar to human long-term memory.

**Core Value:**
- Agents can search and retrieve relevant knowledge from organizational context
- Semantic search enables discovery beyond keyword matching
- GraphRAG integration enables relationship-aware knowledge discovery
- Centralized knowledge management reduces information silos
- Supports organizational learning and knowledge persistence

**Timeline:** Q2 2026 (Phase 1 foundation, GraphRAG Phase 2)

**Impact:** Transforms agents from stateless to knowledge-aware, enabling sophisticated decision-making based on accumulated organizational knowledge.

---

## 2. Problem Statement

### 2.1 Current State

Agents currently operate with:
- **No centralized knowledge base** — Each agent has only long-term memory of their own conversations
- **Limited information context** — Cannot access organizational data, past decisions, or external knowledge
- **Manual information sharing** — Agents cannot discover relevant knowledge without explicit user input
- **Isolated knowledge silos** — Knowledge created by one agent is not available to others
- **No semantic organization** — Knowledge is stored by conversation date, not by meaning
- **Disconnected from ERP** — No integration with enterprise data sources
- **Keyword-only search** — Cannot find conceptually-related information

### 2.2 Desired Capability

Need to support scenarios like:
1. **Knowledge Discovery** — Agent searches "product pricing strategy" and finds related decisions, market analysis, and past pricing discussions
2. **Context Enrichment** — When analyzing a customer inquiry, agent automatically retrieves relevant customer history, product information, and past solutions
3. **Graph-Based Reasoning** — Agent discovers "if customer has issue X, then solution Y worked before" by traversing knowledge relationships
4. **Cross-Agent Learning** — Sales agent learns from customer service agent's successful resolution patterns
5. **ERP Integration** — Agent retrieves product data, inventory, customer records without API calls in every conversation
6. **Knowledge Organization** — Enterprise can organize knowledge into topics, categories, and relationships

### 2.3 Why a Knowledge Base System?

A centralized Knowledge Base provides:
- **Semantic Search** — Find knowledge by meaning, not just keywords
- **Hybrid Retrieval** — Combine BM25 (keyword) + semantic (embedding) + graph (relationships)
- **Scalability** — Single source of truth for all organizational knowledge
- **Agent Autonomy** — Agents can research without constant human input
- **Knowledge Persistence** — Learning compounds over time across agents
- **Relationship Awareness** — GraphRAG enables reasoning about connections
- **ERP Integration** — Bridge between transactional data and agent knowledge
- **Audit & Compliance** — Centralized logging of knowledge access and usage

---

## 3. Goals & Success Criteria

### 3.1 Primary Goals

1. **Enable Semantic Knowledge Search** — Agents can find conceptually-related information
   - Goal: Support semantic queries (embeddings-based search)
   - Success: Find relevant documents even with different keywords (query: "pricing rules" finds "cost structure" document)

2. **Implement Hybrid Search** — Combine multiple retrieval strategies
   - Goal: Use BM25 + semantic + graph in single query
   - Success: Top-K results include both exact matches and conceptually-related items

3. **Integrate with ERP Data** — Connect Knowledge Base to enterprise systems
   - Goal: Make ERP data searchable as knowledge
   - Success: Agents can query product data, customer records, inventory without separate API

4. **Provide Graph-Based Discovery** — Enable relationship-aware reasoning
   - Goal: Implement GraphRAG integration (Phase 2)
   - Success: Find "similar to known solution" through relationship traversal

5. **Enable Agent Access** — Agents seamlessly retrieve knowledge
   - Goal: Knowledge retrieval integrated into agent workflows
   - Success: Agents invoke knowledge search in tools/processors with transparent embedding

6. **Support Knowledge Management** — Humans can organize and maintain the KB
   - Goal: APIs for CRUD operations on knowledge
   - Success: Create, update, categorize, delete knowledge items with audit trail

### 3.2 Success Metrics

| Metric | Target | Notes |
| --- | --- | --- |
| Semantic search accuracy | > 85% (relevance judgement) | Precision of top-5 results |
| Hybrid search improvement | > 20% vs keyword-only | Measured by result utility |
| KB query latency | < 500ms p95 | Including embedding generation |
| Agent knowledge adoption | > 70% of agents | Use KB in decisions per week |
| False positive rate | < 10% | Irrelevant results per search |
| Knowledge coverage | > 1000 items in MVP | Documents, FAQs, past solutions |
| ERP integration coverage | 5+ primary entities | Products, customers, orders, inventory, contacts |
| Graph relationship accuracy | > 90% | Manual verification of inferred relationships |

---

## 4. Scope & Definitions

### 4.1 What's Included

**In Scope for Phase 1 (MVP):**
- Semantic knowledge search using embeddings
- BM25 (full-text) hybrid with semantic search
- Knowledge item storage in Mastra workspace
- LibSQL vector index for embeddings
- Basic knowledge management (create, read, update, delete)
- Agent tools for knowledge search
- ERP data integration (read-only initial)
- Knowledge categorization and tagging
- Audit logging of access
- Rate limiting and cost control

**In Scope for Phase 2:**
- GraphRAG implementation for relationship-based discovery
- Knowledge graph visualization
- Advanced knowledge synthesis (combining multiple sources)
- Relationship inference from documents
- Recommendation engine (suggest relevant knowledge proactively)

**Deferred (Phase 3+):**
- ML-based knowledge clustering
- Automatic knowledge extraction from agent conversations
- Knowledge versioning and diff tracking
- Multi-workspace federation
- Knowledge marketplace (share across organizations)
- Custom embedding models
- Real-time indexing with change streams
- Advanced analytics and knowledge metrics

### 4.2 What's Excluded

- New search engine or vector database (uses LibSQL)
- Specialized LLM fine-tuning for KB (uses base model)
- Knowledge graph visualization UI (API only in Phase 1)
- ML-based document classification (uses manual tagging)
- Real-time knowledge collaboration (eventual consistency OK)
- Knowledge encryption at rest (uses OS-level security)

### 4.3 Key Definitions

| Term | Definition |
| --- | --- |
| **Knowledge Item** | Atomic unit of knowledge: document, FAQ, decision record, solution, or fact |
| **Knowledge Base** | Centralized repository of all organizational knowledge items |
| **Embedding** | Numeric vector representation (384-dim) of knowledge item content |
| **Semantic Search** | Finding items by meaning similarity using embeddings |
| **Hybrid Search** | Combining keyword (BM25) + semantic + graph retrieval methods |
| **Vector Index** | LibSQL table storing embeddings for fast similarity search |
| **Knowledge Graph** | Network of relationships between knowledge items (Phase 2) |
| **GraphRAG** | Graph Retrieval-Augmented Generation for relationship-aware search |
| **ERP Data** | Transactional data from enterprise systems (products, customers, orders) |
| **Workspace** | Mastra workspace as file-backed storage for knowledge items |
| **Embedding Model** | fastembed (all-minilm-l6-v2) used for all vectors, 384 dimensions |

---

## 5. Target Users & Use Cases

### 5.1 Primary Users

1. **Research Agents** — Agents performing analysis and discovery
   - Example: Market research agent queries KB for past market analysis, competitor data
   - Example: Product research agent finds feature requests, design decisions

2. **Customer Service Agents** — Agents handling customer interactions
   - Example: Support agent searches KB for solutions to similar customer problems
   - Example: Sales agent finds relevant case studies, pricing history for customer

3. **Operations Agents** — Agents managing internal processes
   - Example: Hiring agent searches past hiring decisions, job descriptions, culture notes
   - Example: Finance agent retrieves budget history, approval patterns, cost data

4. **Knowledge Workers** — Humans organizing and curating knowledge
   - Example: Create product documentation, add FAQs, record decisions
   - Example: Maintain customer profiles, competitive intelligence

5. **Enterprise Admins** — Manage KB settings, integrations, access
   - Example: Connect to ERP systems, configure sync schedules
   - Example: Set up knowledge categorization, audit policies

### 5.2 Use Cases

#### Use Case 1: Customer Support via Knowledge Retrieval
```
Customer: "Why was my order cancelled?"
  ↓
Support Agent receives message
  ↓
Knowledge Search: "order cancellation reasons"
  ↓
KB returns:
  - Cancellation Policy (FAQ)
  - Past similar cases with resolutions
  - Customer payment history from ERP
  - Recent order analysis
  ↓
Agent composes response using KB context
```

#### Use Case 2: Sales Deal Analysis
```
Sales Agent: "Analyze potential deal with AcmeCorp for $100K"
  ↓
Knowledge Search executed in parallel:
  - "AcmeCorp" → Customer profile, past deals, decision-makers
  - "$100K contract" → Similar deals, pricing patterns, approval workflows
  - Product stack → Implementation success rates, common issues
  ↓
Results ranked by relevance and recency
  ↓
Agent synthesizes: "Similar deal from 2025 closed in 2 weeks, customer had integration concerns"
```

#### Use Case 3: Product Decision Research
```
Product Manager: "Should we add feature X?"
  ↓
Research Workflow uses Knowledge Search:
  - Step 1: Search "feature X" → Find past discussions, rejections, similar features
  - Step 2: Search "customer pain points" → Find user requests, support tickets
  - Step 3: Search "competitor analysis" → Find how competitors implement similar features
  - Step 4: Graph search → Find relationships (which customers requested, success outcomes)
  ↓
Workflow aggregates: Knowledge graph shows feature clusters and customer patterns
```

#### Use Case 4: Employee Onboarding Agent
```
New Hire: "What's our product's main competitive advantage?"
  ↓
Onboarding Agent searches KB:
  - "competitive advantage" → Marketing materials, positioning docs
  - ERP query: Product features, pricing vs competitors
  - "company history" → Culture documents, founding story
  ↓
Agent synthesizes into personalized onboarding context
```

#### Use Case 5: Graph-Based Recommendation (Phase 2)
```
Support Agent resolving Issue Type A
  ↓
GraphRAG suggests: "Similar issue was resolved using Solution B"
  ↓
Agent inspects relationship: Issue Type A → Similar to Past Issue X → Solution B worked
  ↓
Agent offers Solution B proactively, improving resolution time
```

---

## 6. Feature Description & Functional Requirements

### 6.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│         Agent Interaction Layer                         │
│  (Knowledge Search Tools, Research Workflows)           │
└────────────────┬────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────┐
│         Knowledge Base API Layer                        │
│  (Search, CRUD, Graph Traversal, ERP Sync)            │
└────────────────┬────────────────────────────────────────┘
                 │
      ┌──────────┼──────────┬─────────────┐
      │          │          │             │
┌─────▼──┐ ┌────▼──┐ ┌────▼────┐  ┌────▼────┐
│ Search │ │ Graph │ │  ERP    │  │  Index  │
│ Engine │ │Query  │ │ Adapter │  │  Sync   │
└─────┬──┘ └───┬───┘ └─────┬───┘  └────┬────┘
      │        │          │           │
      └────────┼──────────┼───────────┘
               │
      ┌────────▼──────────────┐
      │  Storage Layer        │
      ├──────────────────────┤
      │ • LibSQL Vector Index│
      │ • Workspace Files    │
      │ • Knowledge Graph    │
      │ • Audit Log          │
      └──────────────────────┘
```

### 6.2 Knowledge Item Schema

```typescript
// Core knowledge item
type KnowledgeItem = {
  id: string;                      // UUID, globally unique
  workspaceId: string;             // Which workspace (eventually multi-workspace)
  title: string;                   // Human-readable title
  content: string;                 // Full markdown content
  summary?: string;                // Short summary for search preview
  category: string;                // Primary category (e.g., "Product", "Sales", "Operations")
  tags?: string[];                 // Additional tags for filtering
  source: 'manual' | 'erp' | 'agent_generated' | 'import';
  sourceId?: string;               // Reference to source system (e.g., ERP record ID)

  // Metadata
  createdAt: string;               // ISO timestamp
  updatedAt: string;               // ISO timestamp
  createdBy: string;               // User or agent ID
  updatedBy: string;               // User or agent ID
  expiresAt?: string;              // Optional TTL (null = permanent)

  // Indexing
  embedding: number[];             // 384-dim vector, generated on create/update
  embeddingModel: string;          // "fastembed/all-minilm-l6-v2"
  embeddingGeneratedAt: string;    // Timestamp of embedding creation

  // Relationships (Phase 2)
  relatedItemIds?: string[];       // Links to related knowledge items
  graphNodes?: GraphNode[];        // Knowledge graph nodes (Phase 2)

  // Access & Audit
  accessCount: number;             // How many times searched/retrieved
  lastAccessedAt?: string;         // Most recent access
  accessLog?: AccessLogEntry[];    // Audit trail

  // Privacy & Permissions
  visibility: 'public' | 'internal' | 'restricted';
  allowedAgents?: string[];        // Which agents can access (if restricted)
  allowedUsers?: string[];         // Which users can access (if restricted)
};

// Access log entry
type AccessLogEntry = {
  timestamp: string;
  userId?: string;                 // User accessing
  agentId?: string;                // Agent accessing
  action: 'view' | 'search' | 'modify' | 'delete';
  context?: string;                // Why accessed (search query, workflow, etc.)
};

// ERP-synced item (subset)
type ERPKnowledgeItem = KnowledgeItem & {
  source: 'erp';
  sourceId: string;                // ERP system ID
  syncedAt: string;                // Last sync timestamp
  erp: ERPMetadata;
};

type ERPMetadata = {
  entity: 'product' | 'customer' | 'order' | 'inventory' | 'contact';
  systemId: string;                // E.g., "salesforce", "sap", "odoo"
  recordId: string;                // ID in external system
  lastModifiedInSource: string;    // Source system update time
};
```

### 6.3 Knowledge Search API

```typescript
// Search request (hybrid mode)
type KnowledgeSearchRequest = {
  query: string;                   // User query (e.g., "pricing strategy for SaaS")
  mode: 'hybrid' | 'semantic' | 'keyword' | 'graph';  // Search strategy
  limit?: number;                  // Max results (default: 10)
  offset?: number;                 // For pagination
  filters?: {
    category?: string;
    tags?: string[];              // OR logic
    source?: KnowledgeItem['source'][];
    minConfidence?: number;        // 0-1 for semantic search relevance
    dateRange?: {from: string, to: string};
    visibility?: KnowledgeItem['visibility'];
  };
  graphConfig?: {                  // For 'graph' mode (Phase 2)
    maxDepth?: number;             // Relationship depth (default: 2)
    edgeTypes?: string[];          // Which relationships to follow
  };
};

// Search result item
type KnowledgeSearchResult = {
  id: string;
  title: string;
  summary: string;
  category: string;
  tags: string[];
  source: KnowledgeItem['source'];

  // Relevance scoring
  relevanceScore: number;          // 0-1, combined score
  semanticScore?: number;          // 0-1, embedding similarity
  keywordScore?: number;           // 0-1, BM25 score
  graphScore?: number;             // 0-1, relationship relevance

  // Excerpt for preview
  excerpt?: string;                // Relevant paragraph with highlighting

  // Relationships (Phase 2)
  relatedResults?: KnowledgeSearchResult[]; // Direct relationships
  path?: string;                   // Path from query to result in graph
};

// Search response
type KnowledgeSearchResponse = {
  query: string;
  mode: 'hybrid' | 'semantic' | 'keyword' | 'graph';
  results: KnowledgeSearchResult[];
  totalCount: number;
  executionTimeMs: number;

  // Metadata
  embeddingUsed: boolean;          // Whether embeddings were used
  sourceBreakdown: Record<string, number>;  // Results by source type
  graphExplored?: boolean;         // Whether graph was traversed
};
```

### 6.4 Knowledge Management API

```typescript
// Create knowledge item
type CreateKnowledgeItemRequest = {
  title: string;
  content: string;
  summary?: string;
  category: string;
  tags?: string[];
  source?: KnowledgeItem['source'];
  sourceId?: string;
  visibility?: KnowledgeItem['visibility'];
  allowedAgents?: string[];
  allowedUsers?: string[];
};

// Response includes generated embedding + ID
type CreateKnowledgeItemResponse = KnowledgeItem;

// Update knowledge item
type UpdateKnowledgeItemRequest = {
  id: string;
  title?: string;
  content?: string;
  summary?: string;
  category?: string;
  tags?: string[];
  visibility?: KnowledgeItem['visibility'];
  // Re-generates embedding if content changes
};

// Delete knowledge item
type DeleteKnowledgeItemRequest = {
  id: string;
  reason?: string;  // For audit log
};

// Bulk operations
type BulkImportRequest = {
  items: CreateKnowledgeItemRequest[];
  onConflict?: 'skip' | 'update' | 'error';
};

type BulkImportResponse = {
  created: number;
  updated: number;
  skipped: number;
  errors: {itemIndex: number, error: string}[];
};

// Categorization
type GetCategoriesResponse = {
  categories: {
    name: string;
    count: number;  // Items in category
    description?: string;
  }[];
};
```

### 6.5 Agent Integration

```typescript
// Knowledge search tool for agents
tools: {
  search_knowledge: async (params: {
    query: string;
    mode?: 'hybrid' | 'semantic' | 'keyword';
    limit?: number;
    category?: string;
  }): Promise<KnowledgeSearchResponse> => {
    // Implemented in knowledge-service
  }
}

// Example agent usage
const agent = createAgent({
  id: 'support-agent',
  instructions: `You are a support agent. When answering customer questions:
    1. Always search the knowledge base first
    2. Use search_knowledge tool with customer's issue as query
    3. Consider results in your response
    4. Cite knowledge items when applicable`,
  tools: {
    search_knowledge,  // Provided by KB system
    // ... other tools
  },
});

// Search in workflow
const workflow = {
  steps: [
    {
      type: 'query',
      id: 'find_similar_issues',
      query: 'search_knowledge("{customer_issue}")',
      // Returns KnowledgeSearchResponse
    },
    {
      type: 'aggregate',
      sourceSteps: ['find_similar_issues'],
      format: 'structured',
      template: 'Create solution list from found issues'
    }
  ]
};
```

### 6.6 ERP Integration

```typescript
// ERP adapter configuration
type ERPAdapterConfig = {
  system: 'salesforce' | 'sap' | 'odoo' | 'custom';
  credentials: {
    apiKey: string;     // Encrypted in DB
    apiUrl: string;
    // system-specific auth
  };
  syncConfig: {
    entities: ERPEntity[];
    syncInterval: number;  // minutes
    batchSize: number;
    conflictResolution: 'source-wins' | 'kb-wins' | 'merge';
  };
};

type ERPEntity = {
  name: 'product' | 'customer' | 'order' | 'inventory' | 'contact';
  fields: {
    title: string;      // Mapped to KB title
    content: string;    // Mapped to KB content
    category?: string;  // E.g., "Product" for products
    tags?: string[];
  };
  filter?: {           // Which records to sync
    where: string;     // SQL-like query
  };
};

// Sync operation
type ERPSyncRequest = {
  system: string;
  entity: string;
  operation: 'full' | 'incremental';
};

type ERPSyncResponse = {
  createdCount: number;
  updatedCount: number;
  deletedCount: number;
  errorCount: number;
  errors: {recordId: string, error: string}[];
  completedAt: string;
};
```

### 6.7 GraphRAG Integration (Phase 2)

```typescript
// Knowledge graph node
type GraphNode = {
  id: string;
  label: string;              // Category/type of knowledge
  properties: Record<string, unknown>;
  embeddingId: string;        // Link to KB item
};

// Knowledge graph edge
type GraphEdge = {
  source: string;             // Node ID
  target: string;             // Node ID
  type: string;               // Relationship type (e.g., "similar_to", "caused_by")
  weight?: number;            // Relationship strength (0-1)
  metadata?: Record<string, unknown>;
};

// Graph query (Phase 2)
type GraphQueryRequest = {
  nodeId?: string;            // Start from specific node
  or_query?: string;          // Natural language query for semantic matching
  maxDepth?: number;          // Hops to traverse
  edgeFilters?: {
    types?: string[];
    minWeight?: number;
  };
};

type GraphQueryResponse = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  paths: {
    from: string;
    to: string;
    distance: number;
    hops: string[];           // Node IDs in path
  }[];
};
```

---

## 7. Technical Implementation Details

### 7.1 Storage Architecture

**Location:** `packages/mastra-engine/src/knowledge-base/`

**Database Schema (LibSQL):**

```sql
-- Main knowledge items table
CREATE TABLE knowledge_items (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  summary TEXT,
  category TEXT NOT NULL,
  tags TEXT,                    -- JSON array
  source TEXT NOT NULL,         -- 'manual' | 'erp' | 'agent_generated' | 'import'
  source_id TEXT,
  created_at TEXT NOT NULL,     -- ISO timestamp
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  expires_at TEXT,
  visibility TEXT DEFAULT 'internal',  -- 'public' | 'internal' | 'restricted'
  allowed_agents TEXT,          -- JSON array
  allowed_users TEXT,           -- JSON array
  access_count INTEGER DEFAULT 0,
  last_accessed_at TEXT,

  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  INDEX idx_workspace_category (workspace_id, category),
  INDEX idx_created_at (created_at),
  INDEX idx_source (source)
);

-- Vector embeddings (LibSQLVector table)
CREATE TABLE knowledge_embeddings (
  id TEXT PRIMARY KEY,
  knowledge_item_id TEXT NOT NULL,
  embedding VECTOR(384),        -- 384-dimensional vector
  embedding_model TEXT NOT NULL,
  embedding_generated_at TEXT NOT NULL,

  FOREIGN KEY (knowledge_item_id) REFERENCES knowledge_items(id),
  INDEX idx_knowledge_item (knowledge_item_id)
);

-- Access audit log
CREATE TABLE knowledge_access_log (
  id TEXT PRIMARY KEY,
  knowledge_item_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  user_id TEXT,
  agent_id TEXT,
  action TEXT NOT NULL,         -- 'view' | 'search' | 'modify' | 'delete'
  context TEXT,

  FOREIGN KEY (knowledge_item_id) REFERENCES knowledge_items(id),
  INDEX idx_knowledge_access (knowledge_item_id, timestamp),
  INDEX idx_user_access (user_id, timestamp)
);

-- ERP sync metadata
CREATE TABLE erp_sync_metadata (
  id TEXT PRIMARY KEY,
  knowledge_item_id TEXT NOT NULL,
  erp_system TEXT NOT NULL,     -- 'salesforce', 'sap', etc.
  erp_entity TEXT NOT NULL,     -- 'product', 'customer', etc.
  erp_record_id TEXT NOT NULL,
  last_modified_in_source TEXT,
  synced_at TEXT NOT NULL,

  FOREIGN KEY (knowledge_item_id) REFERENCES knowledge_items(id),
  UNIQUE (erp_system, erp_record_id),
  INDEX idx_erp_sync (erp_system, erp_entity)
);

-- Knowledge graph (Phase 2)
CREATE TABLE knowledge_graph_nodes (
  id TEXT PRIMARY KEY,
  knowledge_item_id TEXT NOT NULL,
  label TEXT NOT NULL,
  properties TEXT,              -- JSON

  FOREIGN KEY (knowledge_item_id) REFERENCES knowledge_items(id)
);

CREATE TABLE knowledge_graph_edges (
  id TEXT PRIMARY KEY,
  source_node_id TEXT NOT NULL,
  target_node_id TEXT NOT NULL,
  type TEXT NOT NULL,           -- Relationship type
  weight REAL,
  metadata TEXT,                -- JSON

  FOREIGN KEY (source_node_id) REFERENCES knowledge_graph_nodes(id),
  FOREIGN KEY (target_node_id) REFERENCES knowledge_graph_nodes(id),
  INDEX idx_source_edges (source_node_id),
  INDEX idx_target_edges (target_node_id)
);
```

### 7.2 Embedding Generation

**Model:** fastembed (all-minilm-l6-v2)
**Dimensions:** 384
**Batch Size:** 32 items per batch
**Caching:** Embeddings cached in LibSQLVector

```typescript
// Embedding service
class KnowledgeEmbeddingService {
  constructor(private embedder: FastEmbed) {}

  async generateEmbedding(text: string): Promise<number[]> {
    // Uses unified fastembed instance
    const [embedding] = await this.embedder.embed([text]);
    return embedding;
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    // Batch generation for performance
    return await this.embedder.embed(texts);
  }

  async storeEmbedding(itemId: string, embedding: number[]): Promise<void> {
    // Store in LibSQLVector
    await vectorIndex.insert(itemId, embedding);
  }
}
```

### 7.3 Search Implementation

**Hybrid Search Strategy:**

1. **Keyword Search (BM25)** — Full-text index on title, summary, content
   - Uses LibSQL FTS5 capabilities
   - Returns top-20 by keyword relevance
   - Score: 0-1 normalized

2. **Semantic Search** — Vector similarity using embeddings
   - Generate embedding from query
   - Find K nearest neighbors in LibSQLVector
   - Score = cosine similarity (0-1)
   - Top-20 results

3. **Combined Ranking:**
   ```typescript
   hybridScore = 0.4 * keywordScore + 0.6 * semanticScore
   // Semantic weighted higher as it's more meaningful
   ```

4. **Filtering:** Category, tags, visibility, date range applied post-search

```typescript
async search(request: KnowledgeSearchRequest): Promise<KnowledgeSearchResponse> {
  const query = request.query;

  if (request.mode === 'hybrid' || request.mode === 'keyword') {
    // Full-text search
    keywordResults = await this.bm25Search(query, request.limit * 2);
  }

  if (request.mode === 'hybrid' || request.mode === 'semantic') {
    // Semantic search
    const embedding = await this.embeddingService.generateEmbedding(query);
    semanticResults = await this.vectorIndex.search(embedding, request.limit * 2);
  }

  if (request.mode === 'hybrid') {
    // Combine and rank
    const combined = this.mergeResults(keywordResults, semanticResults);
    results = this.rankByCombinedScore(combined).slice(0, request.limit);
  } else {
    results = (keywordResults || semanticResults).slice(0, request.limit);
  }

  // Apply filters
  results = this.applyFilters(results, request.filters);

  return {
    query,
    mode: request.mode,
    results: results.map(r => this.formatResult(r)),
    totalCount: results.length,
    executionTimeMs: Date.now() - startTime,
  };
}
```

### 7.4 ERP Integration Architecture

**Sync Process:**

```
ERP Adapter → Query ERP System → Transform → Create/Update KB Items → Index
```

**Per-Entity Sync Flow:**

```typescript
async syncERPEntity(config: ERPAdapterConfig, entity: ERPEntity) {
  // 1. Query ERP
  const records = await erpClient.query({
    entity: entity.name,
    filter: entity.filter,
    limit: config.batchSize,
  });

  // 2. Transform to KB items
  const kbItems = records.map(record => ({
    title: record[entity.fields.title],
    content: record[entity.fields.content],
    category: entity.fields.category,
    source: 'erp',
    sourceId: record.id,
    visibility: 'internal',  // ERP data typically internal
  }));

  // 3. Upsert to KB
  for (const item of kbItems) {
    const existing = await this.findByERPId(record.id);
    if (existing) {
      await this.update(existing.id, item);
    } else {
      await this.create(item);
    }
  }

  // 4. Index embeddings
  await this.indexItems(kbItems);

  // 5. Record sync metadata
  await this.recordSyncMetadata(config.system, entity.name, Date.now());
}

// Scheduled sync
scheduleSync(config: ERPAdapterConfig) {
  setInterval(async () => {
    for (const entity of config.entities) {
      await this.syncERPEntity(config, entity);
    }
  }, config.syncInterval * 60 * 1000);
}
```

### 7.5 Agent Tool Implementation

**Tool: `search_knowledge`**

```typescript
const searchKnowledgeTool = {
  name: 'search_knowledge',
  description: 'Search the organizational knowledge base for relevant documents',
  definition: {
    type: 'function',
    function: {
      name: 'search_knowledge',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'What to search for (e.g., "pricing strategy", "customer issues")',
          },
          mode: {
            type: 'string',
            enum: ['hybrid', 'semantic', 'keyword'],
            description: 'Search mode (default: hybrid)',
            default: 'hybrid',
          },
          limit: {
            type: 'number',
            description: 'Max results to return (default: 5)',
            default: 5,
          },
          category: {
            type: 'string',
            description: 'Filter by category (e.g., "Product", "Sales")',
          },
        },
        required: ['query'],
      },
    },
  },
  execute: async (params) => {
    return await knowledgeService.search({
      query: params.query,
      mode: params.mode || 'hybrid',
      limit: params.limit || 5,
      filters: params.category ? { category: params.category } : undefined,
    });
  },
};

// Integration in agent creation
const agent = createAgent({
  id: 'sales-agent',
  tools: {
    ...createExternalAccountTools(communication),
    search_knowledge: searchKnowledgeTool,  // Added by KB system
  },
});
```

---

## 8. Integration Points

### 8.1 Dependencies

| Component | Purpose | Status |
| --- | --- | --- |
| **Mastra** | Agent framework, memory system | ✅ Existing |
| **LibSQL** | Vector storage, embeddings | ✅ Existing |
| **fastembed** | Embedding model | ✅ Existing |
| **Workspace** | File-backed storage | ✅ Existing |
| **ERP Systems** | Data source (Salesforce, SAP, etc.) | 🔄 To be integrated |
| **GraphRAG** | Graph-based retrieval (Phase 2) | ⏳ Future |
| **Agent Tools System** | Tool registration | ✅ Existing |

### 8.2 Integration with Long-Term Memory

Knowledge Base complements Long-Term Memory:

| Aspect | Long-Term Memory | Knowledge Base |
| --- | --- | --- |
| **Scope** | Agent-specific conversations | Organizational knowledge |
| **Source** | Agent's own interaction history | Manual input + ERP + agents |
| **Access** | Single agent | All agents + users |
| **Organization** | Chronological (by date) | By category, relationship, semantic meaning |
| **Update** | Automatic from agent activity | Manual or sync-based |
| **Use Case** | Agent remembers its own past | Everyone learns from all knowledge |

**Combined Usage:**
```
Agent input step:
  1. Search LTM for own past context
  2. Search KB for organizational knowledge
  3. Combine results as system context
  4. Generate response
```

### 8.3 Integration with Research Workflow

Research Workflow uses Knowledge Base:

```typescript
const researchWorkflow = {
  steps: [
    {
      type: 'query',
      id: 'find_prior_research',
      // Use KB search instead of external research
      query: 'search_knowledge("{topic}")',
    },
    {
      type: 'filter',
      sourceStep: 'find_prior_research',
      criteria: 'Prefer sources from last 6 months',
    },
    {
      type: 'aggregate',
      sourceSteps: ['find_prior_research'],
      format: 'summary',
    },
  ],
};
```

---

## 9. Data Flow & User Interactions

### 9.1 Create Knowledge Item

```
User/System Input
  ↓
POST /api/knowledge/items {title, content, category, tags}
  ↓
Validate input
  ↓
Generate embedding from content
  ↓
Store item + embedding in LibSQL
  ↓
Update full-text index
  ↓
Log creation in audit trail
  ↓
Return KnowledgeItem with ID
```

### 9.2 Search Knowledge

```
Agent calls search_knowledge(query)
  or User POST /api/knowledge/search {query, mode}
  ↓
Parse query
  ↓
Generate embedding from query
  ↓
If hybrid or keyword: BM25 search → top-K
  ↓
If hybrid or semantic: Vector similarity search → top-K
  ↓
Combine results if hybrid
  ↓
Apply filters (category, tags, date, visibility)
  ↓
Rank by relevance score
  ↓
Format results with excerpts
  ↓
Log search in access log
  ↓
Return KnowledgeSearchResponse
```

### 9.3 Sync from ERP

```
Scheduled trigger (or manual POST /api/knowledge/sync)
  ↓
For each configured ERP entity:
  ├─ Query ERP system
  ├─ Transform records to KB items
  ├─ For each record:
  │  ├─ Check if exists in KB (by sourceId)
  │  ├─ If new: create item
  │  ├─ If exists: update if changed
  │  └─ Generate/update embedding
  ├─ Record sync metadata
  └─ Report results
  ↓
Return SyncResponse with counts and errors
```

### 9.4 Agent Uses Knowledge in Workflow

```
Agent input arrives
  ↓
Agent processor triggers
  ↓
LongTermMemory search → relevant past conversations
  ↓
search_knowledge tool available
  ↓
If agent decides to search:
  ├─ Call search_knowledge(query)
  ├─ Receive top-5 results
  └─ Inject into context
  ↓
Agent generates response using both LTM and KB context
  ↓
Output step: LongTermMemory indexes agent's output
```

---

## 10. Technical Specifications & Constraints

### 10.1 Performance Requirements

| Operation | Requirement | Rationale |
| --- | --- | --- |
| Search latency | < 500ms p95 | Interactive agent use |
| Embedding generation | < 200ms per item | Should not block KB writes |
| Bulk import | < 2000 items/min | Daily ERP sync |
| Vector similarity search | < 300ms for K=10 | KNN search in 384 dims |
| BM25 search | < 100ms | Full-text index |
| Create knowledge item | < 1s | API response time |

### 10.2 Scalability

| Dimension | Initial | Target (Y1) | Target (Y2) |
| --- | --- | --- | --- |
| Knowledge items | 1,000 | 100,000 | 1M+ |
| Embedding vectors | 1,000 | 100,000 | 1M+ |
| Daily searches | 100 | 10,000 | 100,000+ |
| ERP records synced | 0 | 50,000 | 500,000+ |
| Concurrent agents | 1-5 | 20-50 | 100+ |

**Scaling Strategy:**
- **Phase 1:** Single LibSQL database, per-workspace isolation
- **Phase 2:** Sharding by workspace, dedicated vector index
- **Phase 3:** Distributed indexing, multi-region replica

### 10.3 Data Security & Compliance

- **Encryption in Transit:** HTTPS + TLS 1.3
- **Encryption at Rest:** OS-level (delegated to deployment)
- **Access Control:** Visibility levels (public, internal, restricted) + agent/user allowlists
- **Audit Logging:** All access logged with timestamp, user/agent, action, context
- **Data Retention:** Optional TTL on items, manual deletion possible
- **PII Handling:** No automatic detection; rely on source system classification
- **Compliance:** Audit trail supports SOC2, GDPR compliance

### 10.4 Reliability & Recovery

- **Database Durability:** LibSQL provides ACID guarantees
- **Embedding Consistency:** Regenerable from content (not critical to persist)
- **Backup Strategy:** Backup workspace files + database periodically
- **Recovery:** Restore from backup, re-index embeddings if lost
- **Error Handling:**
  - Failed ERP sync: Logged, retry next cycle, no partial commit
  - Failed embedding: Item created without embedding, can re-index later
  - Search failures: Return error, don't return partial results

### 10.5 Constraints & Limitations

| Constraint | Limit | Reason |
| --- | --- | --- |
| Item title | 500 chars | Searchable, must be brief |
| Item content | 1MB | Embedding + index limits |
| Embedding dimensions | 384 | fastembed standard |
| Vector search K | 1000 | Memory constraints |
| Tags per item | 20 | Tag explosion prevention |
| Search results | 100 max | UI pagination |
| ERP sync batch | 5000 records | Memory + network |
| Graph depth (Phase 2) | 5 hops | Query complexity |

---

## 11. Rollout & Launch Plan

### 11.1 Phase 1: MVP (Q2 2026, Weeks 1-6)

**Week 1-2: Foundation**
- [ ] Design finalized, stakeholder review
- [ ] Database schema created
- [ ] LibSQL vector index configured
- [ ] Embedding service implemented

**Week 2-3: Search Engine**
- [ ] BM25 full-text search implemented
- [ ] Semantic search via embeddings
- [ ] Hybrid search ranking
- [ ] Search API endpoints

**Week 3-4: Knowledge Management**
- [ ] CRUD APIs (create, read, update, delete)
- [ ] Bulk import
- [ ] Categorization and tagging
- [ ] Access control (visibility levels)

**Week 4-5: Integration**
- [ ] Agent tool integration (search_knowledge)
- [ ] Long-term memory integration
- [ ] Audit logging
- [ ] Error handling and monitoring

**Week 5-6: Testing & Docs**
- [ ] Unit tests (> 80% coverage)
- [ ] Integration tests with agents
- [ ] Load testing (1000 searches/min)
- [ ] API documentation
- [ ] Operational runbooks

**MVP Launch Criteria:**
- ✅ Search API functional
- ✅ Agent tool available
- ✅ 100+ knowledge items loaded
- ✅ < 500ms p95 search latency
- ✅ Zero knowledge loss on DB restart

### 11.2 Phase 2: ERP Integration & GraphRAG (Q3 2026)

- [ ] ERP adapter framework
- [ ] Salesforce/SAP/Odoo connectors
- [ ] ERP data transformation
- [ ] Scheduled sync pipeline
- [ ] Conflict resolution strategies
- [ ] GraphRAG implementation
- [ ] Knowledge graph construction
- [ ] Graph traversal search
- [ ] Relationship inference

### 11.3 Phase 3: Advanced Features (Q4 2026+)

- [ ] Knowledge synthesis engine
- [ ] Proactive recommendations
- [ ] Knowledge quality metrics
- [ ] Advanced analytics dashboard
- [ ] Multi-workspace federation
- [ ] Knowledge marketplace

### 11.4 Launch Communication

**Day 0 (Launch):**
- Release KB system to all agents
- Provide 100 initial knowledge items (from internal docs)
- Document search_knowledge tool in agent docs

**Week 1:**
- Send operator training on KB management
- Publish best practices for organizing knowledge
- Set up knowledge item creation process

**Week 2-4:**
- Monitor search quality and user feedback
- Iteratively improve rankings and categorization
- Begin ERP integration pilots with teams

---

## 12. Success Metrics & Monitoring

### 12.1 Key Success Metrics

| Metric | Target | Measurement |
| --- | --- | --- |
| **Adoption** | > 70% of agents use KB | Agent.generate() calls that invoke search_knowledge |
| **Search Quality** | > 85% relevance | User feedback, click-through rate on results |
| **Knowledge Coverage** | > 1,000 items | Item count in database |
| **Performance** | < 500ms p95 | API endpoint monitoring |
| **ERP Sync** | 5+ systems integrated | Phase 2 launch metric |
| **User Satisfaction** | > 4/5 rating | Post-search feedback survey |
| **Knowledge Reuse** | > 60% of unique searches | Track repeat searches, result selection |

### 12.2 Monitoring & Observability

**Metrics to Track:**
```
KB Search Metrics:
  - search_latency_ms (p50, p95, p99)
  - search_count (per mode: hybrid, semantic, keyword)
  - search_error_rate (%)
  - embedding_generation_time_ms
  - bm25_search_time_ms
  - vector_search_time_ms
  - result_click_through_rate (for relevance)
  - result_relevance_feedback (user rating)

KB Management Metrics:
  - knowledge_items_total_count
  - knowledge_items_created_rate (per day)
  - knowledge_items_updated_rate (per day)
  - knowledge_items_by_source (pie chart)
  - storage_size_bytes
  - embedding_cache_hit_rate (%)

ERP Sync Metrics (Phase 2):
  - erp_sync_duration_ms
  - erp_sync_records_imported
  - erp_sync_error_count
  - erp_sync_success_rate (%)

Agent Integration Metrics:
  - agents_using_kb (count)
  - search_knowledge_tool_invocations
  - search_knowledge_error_rate (%)
  - search_knowledge_latency_impact_on_agent (ms)
```

**Dashboards:**
- **Operator Dashboard:** Knowledge item counts, sync status, top searches, errors
- **Agent Dashboard:** Search tool performance, adoption rate, latency
- **User Dashboard:** Search quality feedback, result usefulness

---

## 13. Risks & Mitigation

### 13.1 Risks & Mitigation Strategies

| Risk | Severity | Probability | Mitigation |
| --- | --- | --- | --- |
| **Poor search quality** | High | Medium | Start with curated initial KB, iterate on ranking, user feedback |
| **Irrelevant results poison agent decisions** | High | Medium | Confidence scoring, result review before agent use, audit trail |
| **Performance degradation at scale** | High | Medium | Load testing early, vector index optimization, query caching |
| **ERP data synchronization failures** | Medium | Medium | Retry logic, conflict resolution, sync monitoring, alerts |
| **Knowledge item duplication/staleness** | Medium | High | Bulk import dedup, TTL/expiry, regular audits, user reports |
| **Vector embedding inconsistency** | Medium | Low | Use unified fastembed instance, version tracking, regeneration capability |
| **Agent misuse of KB (over-reliance)** | Medium | Medium | Confidence scores, require verification for critical decisions, monitoring |
| **Security: Unauthorized knowledge access** | Medium | Low | Visibility controls, access logging, audit review, RBAC |
| **Compliance: Data retention & deletion** | Medium | Low | TTL fields, audit trail of deletions, retention policies |
| **Graph complexity (Phase 2)** | Low | Medium | Limit depth, edge filtering, query cost estimation |

### 13.2 Failure Scenarios & Rollback

**Scenario 1: Search quality is poor (< 70% relevance)**
- **Detection:** User feedback, result ratings low
- **Response:** Pause agent KB adoption, improve ranking algorithm, re-train on quality feedback
- **Rollback:** Agents can disable search_knowledge tool, revert to manual context

**Scenario 2: ERP sync corrupts knowledge items**
- **Detection:** Data integrity checks, audit log review
- **Response:** Stop sync, restore from backup, fix ERP adapter
- **Rollback:** Restore knowledge items from pre-sync backup

**Scenario 3: Embedding generation fails at scale**
- **Detection:** Embedding error rate spikes
- **Response:** Fall back to keyword-only search, batch re-index failed items
- **Rollback:** Disable semantic search, use hybrid with empty embeddings (degrades to keyword)

---

## Appendix: Future Enhancements

### Knowledge Synthesis
Combine multiple KB items to generate new insights:
```
Agent asks: "What's our overall pricing strategy across products?"
  ↓
KB search returns: 5 product-specific pricing documents
  ↓
Knowledge synthesis: Combines into cohesive strategy summary
  ↓
Agent includes in response
```

### Proactive Recommendations
Suggest relevant knowledge to agents without being asked:
```
Agent: "Analyzing customer support ticket..."
  ↓
KB system infers: "Similar to past issue X, which had solution Y"
  ↓
Proactively injects: "Consider trying solution Y, worked in similar case"
  ↓
Agent incorporates, faster resolution
```

### Knowledge Quality Score
Rate KB items by accuracy, currency, usefulness:
- New items start at 0.5 (unverified)
- Increase with positive search feedback
- Decrease if contradicted by newer items
- Agents prefer high-quality items

### AI-Powered Knowledge Tagging
Auto-generate tags and categories from content:
- Extract entities (products, customers, processes)
- Classify by domain (sales, support, product)
- Suggest related items
- Reduce manual tagging burden

### Knowledge Marketplace
Share knowledge across organizations:
- Sell curated knowledge sets (e.g., "Industry Best Practices")
- License competitor intelligence
- Build knowledge commons for public use
- Enable knowledge as a product line

---

**Document Version:** 1.0
**Last Updated:** 2026-03-15
**Next Review:** 2026-04-15 (Post-MVP Launch)
