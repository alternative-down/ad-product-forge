# Long-Term Memory Processor: Technical Overview

## What It Does

The `LongTermMemory` processor implements step-wise recovery of past knowledge. It runs on every input step to inject relevant context from the agent's long-term store.

---

## Processing Pipeline

### Input Step (`processInputStep`)

1. **Extract Query:**
   - Collect the last 8 user/assistant/tool messages
   - Format as `[role] message` strings
   - This becomes the search query

2. **Search Workspace:**
   - Hybrid search (BM25 + semantic) over `.forge-memory/<agentId>/observations/`
   - Top-K results: 3
   - Returns markdown files with observations grouped by date

3. **Search Graph:**
   - GraphRAG semantic search over the vector index
   - Uses fastembed for query embedding
   - Graph options: threshold 0.7, randomWalkSteps 50
   - Returns relevant context chunks

4. **Inject Context:**
   - Combine workspace results + graph results
   - Format as system message: `"Recovered past memory relevant to the current step. Use it as supporting recall, not as a replacement for the current conversation."`
   - Insert into message list (clears old injections first)

### Output Step (`processOutputStep`)

1. **Retrieve Observations:**
   - Fetch pending observations from Observational Memory
   - Compare against history limit (12 records after observations exist, unlimited on bootstrap)

2. **Group by Date:**
   - Organize observations into daily buckets
   - Path: `.forge-memory/<agentId>/observations/{YYYY-MM-DD}.md`

3. **Write Files:**
   - Read existing file content
   - Append new observations (skip if already present)
   - Format: `## observation:{id}` headers with type, creation time, and content
   - Include metadata (day, index name, observation count)

4. **Index:**
   - Call `workspace.index()` on each file
   - Makes files searchable for next step's input phase

---

## Code Structure

**Location:** `/packages/mastra-engine/src/agent/memory/long-term-memory.ts`

**Key Methods:**
- `processInputStep()` — Runs on input, injects past memory
- `processOutputStep()` — Runs on output, writes and indexes observations
- `searchWorkspace()` — Hybrid search
- `searchGraph()` — GraphRAG search
- `buildRecallQuery()` — Extracts query from messages

---

## Data Flows

```
Observations (from OM)
  ↓
processOutputStep:
  Write to: .forge-memory/<agentId>/observations/{date}.md
  Index in: LibSQLVector + Workspace indexes
  ↓
Next Step Input:
  buildRecallQuery()
  ↓
  searchWorkspace() + searchGraph()
  ↓
  Inject as system message
  ↓
  Model sees full context + past knowledge
```

---

## Integration with Other Layers

- **Observational Memory:** Provides observations to recover in output step
- **Workspace:** Stores observations as markdown files, provides search index
- **Vector Store (LibSQLVector):** Hosts embeddings for graph search
- **Message List:** LTM injects system messages to provide context without polluting conversation history

---

## Design Notes

- **Per-Step Queries:** Each step's query is built fresh from the last 8 messages, avoiding stale injection
- **Dual Search:** Workspace (exact + semantic) + Graph (relationship-aware) provides comprehensive recall
- **Async:** All search operations are parallel for performance
- **Error Handling:** Search failures are caught and logged; they do not block step execution
- **Cache-Friendly:** System messages are injected, not interspersed with conversation history
