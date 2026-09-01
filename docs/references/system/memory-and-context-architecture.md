# Memory and Context Architecture

## Overview

The agent memory system has three distinct layers:

1. **Working Memory** — The immediate context of the current conversation thread, including message history and workspace state
2. **Observational Memory (OM)** — Compressed reflections of past interactions, stored per thread
3. **Long-Term Memory (LTM)** — Semantic search over observations and workspace files, recovered per step

Together, these layers provide the agent with:

- Immediate access to the current thread's state
- Compressed knowledge from past interactions
- Persistent recall of relevant information during each step

---

## 1. Working Memory

Working Memory is provided by Mastra's native `Memory` system. It maintains:

- The raw message history of the current thread
- Workspace state (enabled, scope: 'thread')
- Raw storage in LibSQL (`LibSQLStore`)

**Configuration** (`memory.ts`):

```typescript
new Memory({
  embedder: fastembed,
  storage: config.storage,
  vector: config.vector,
  options: {
    lastMessages: Number.MAX_SAFE_INTEGER,
    semanticRecall: false,
    observationalMemory: false,
    workingMemory: {
      enabled: true,
      scope: 'thread',
      template: WORKING_MEMORY_TEMPLATE,
    },
  },
});
```

The system disables Mastra's built-in semantic recall and observational memory in favor of our custom implementations.

---

## 2. Observational Memory

Observational Memory (OM) runs as a native Mastra `Processor`. It:

- Observes at the end of each step, compressing the step's messages into observations
- Produces reflections (summaries) from those observations
- Stores observations with metadata per thread and resource

**Configuration** (`observational-memory.ts`):

```typescript
new ObservationalMemory({
  storage: config.storage.stores.memory!,
  model: config.model,
  scope: 'thread',
  observation: { messageTokens: 15000 },
  reflection: { observationTokens: 20000 },
});
```

---

## 3. Long-Term Memory (LTM)

LongTermMemory is a custom `Processor` that:

- Runs on every input step
- Searches for relevant past information based on the current step's query
- Injects recovered context into the message list as a system message

**Layers searched:**

1. **Workspace** — BM25 + semantic hybrid search over `.forge-memory/<agentId>/observations/` markdown files
2. **Graph** — GraphRAG semantic search over the vector index

**Flow** (`long-term-memory.ts`):

```
processInputStep:
  1. Extract query from last 8 messages
  2. Hybrid-search workspace observations
  3. GraphRAG-search vector index
  4. Inject results as system message

processOutputStep:
  1. Fetch pending observations from OM
  2. Group observations by day
  3. Write to `.forge-memory/<agentId>/observations/{YYYY-MM-DD}.md`
  4. Index files in workspace (for next step's search)
```

---

## 4. Context Building per Step

1. **Input Step** (processInputStep):
   - Build a query from the last 8 messages in the thread
   - Search workspace observations (hybrid BM25 + semantic)
   - Search graph with GraphRAG
   - Inject matching results as system message
   - Model now has both immediate message history + relevant past context

2. **Output Step** (processOutputStep):
   - Collect new observations from OM
   - Write them to workspace as markdown files (grouped by date)
   - Index files for next step's search

---

## 5. Storage Architecture

| Component                | Technology                            | Role                                      |
| :----------------------- | :------------------------------------ | :---------------------------------------- |
| **Working Memory Store** | LibSQLStore                           | Raw messages, current thread state        |
| **OM Store**             | LibSQLStore (memory table)            | Observation records, per thread           |
| **Workspace**            | LocalFilesystem + BM25/semantic index | Long-term knowledge in markdown           |
| **Vector Index**         | LibSQLVector                          | Embeddings for workspace and graph search |

---

## 6. Data Flow

```
Step N input:
  │
  ├─ Working Memory provides current message history
  ├─ LTM.processInputStep:
  │   ├─ Search workspace (observations) → system message
  │   └─ Search graph → system message
  │
  └─ Model generates response

Step N output:
  │
  ├─ OM generates observations from step's messages
  ├─ LTM.processOutputStep:
  │   ├─ Write observations to workspace/{date}.md
  │   └─ Index files for next step's search
  │
  └─ Step complete
```

---

## 7. Key Design Decisions

- **Single Thread:** Agents operate in one thread, simplifying persistence and identity.
- **Per-Step Recovery:** Context is built fresh each step based on the current query, avoiding stale injection.
- **Hybrid Search:** Workspace search combines BM25 (exact matching) with semantic similarity.
- **Graph Integration:** GraphRAG provides relationship-aware search over the vector index.
- **Workspace as Source of Truth:** Observations are stored durably in markdown, enabling future auditing and re-indexing.
