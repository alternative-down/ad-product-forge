# Memory System Configuration Reference

**Status:** ✅ FULLY IMPLEMENTED

This document provides technical configuration details for the three-layer memory system integrated into agents via `createAgent()` and `createForgeAgent()`.

For the conceptual architecture and data flow, see `docs/references/system/memory-and-context-architecture.md`.

---

## 1. Working Memory Configuration

Located in: `packages/mastra-engine/src/agent/memory/memory.ts`

**Created by:** `createAgentMemory({ storage, vector })`

**Mastra Memory configuration:**
```typescript
new Memory({
  embedder: fastembed,  // unified instance
  storage: config.storage,
  vector: config.vector,
  options: {
    lastMessages: Number.MAX_SAFE_INTEGER,  // unlimited
    semanticRecall: false,  // disabled, we use LTM
    observationalMemory: false,  // custom OM instead
    workingMemory: {
      enabled: true,
      scope: 'thread',
      template: WORKING_MEMORY_TEMPLATE,
    },
  },
})
```

**Purpose:**
- Persists raw message history for the current thread
- Provides working memory template injection
- Manages thread-scoped context

**Storage:** LibSQLStore (per-agent database)

---

## 2. Observational Memory Configuration

Located in: `packages/mastra-engine/src/agent/memory/observational-memory.ts`

**Created by:** `createObservationalMemory({ storage, model })`

**Mastra ObservationalMemory configuration:**
```typescript
new ObservationalMemory({
  storage: config.storage.stores.memory!,
  model: config.model,
  scope: 'thread',
  observation: { messageTokens: 15000 },  // compression budget
  reflection: { observationTokens: 20000 },  // reflection budget
})
```

**Lifecycle:**
- **On every input step:** Processor adds OM to inputProcessors
- **On every output step:** Processor adds OM to outputProcessors
- **Automatic execution:** Mastra's processor system invokes `observe()` and `reflect()`

**Purpose:**
- Compress past interactions into observations
- Generate reflections from observations
- Store with thread and resource metadata

**Storage:** LibSQLStore (memory table)

**Integration:** Registered in `createAgent()`:
```typescript
const om = createObservationalMemory({ storage, model });
const inputProcessors = [om];
const outputProcessors = [om];
```

---

## 3. Long-Term Memory Configuration

Located in: `packages/mastra-engine/src/agent/memory/long-term-memory.ts`

**Created by:** `LongTermMemory.create({ agentId, om })`

**Activation:**
- Optional in `createAgent()` via `options.longTermMemory = true`
- Automatic in `createForgeAgent()` (which wraps `createAgent({ options: { longTermMemory: true } })`)

**Implementation:** Custom `Processor<'long-term-memory'>` with:

```typescript
class LongTermMemory implements Processor<'long-term-memory'> {
  async processInputStep(args: ProcessInputStepArgs): Promise<void>
  async processOutputStep(args: ProcessOutputStepArgs): Promise<void>
}
```

### 3.1 Input Step (Search & Inject)

**Trigger:** Every agent input step

**Process:**
1. Extract query from last 8 messages in thread
2. Hybrid-search workspace observations:
   ```typescript
   const workspaceResults = await workspace.search(queryText, { mode: 'hybrid' })
   // mode: 'hybrid' = BM25 + semantic similarity
   ```
3. Graph-search via GraphRAG:
   ```typescript
   const graphResults = await this.graphTool.execute({
     query: queryText,
     topK: 5,
   })
   ```
4. Inject results as system message via `args.messageList.addSystem()`

**Result:** Model sees both immediate context and relevant past information

### 3.2 Output Step (Index & Persist)

**Trigger:** Every agent output step

**Process:**
1. Fetch pending observations from OM
2. Group observations by date (YYYY-MM-DD)
3. Write to workspace:
   ```
   .forge-memory/{agentId}/observations/{YYYY-MM-DD}.md
   ```
4. Index files for next step's search

**Result:** New knowledge durably stored and indexed

### 3.3 Storage & Search

**Workspace structure:**
```
.forge-memory/
  {agentId}/
    observations/
      2025-03-15.md
      2025-03-14.md
      ...
```

**Vector index:** LibSQLVector (same database as agent storage)

**Search modes:**
- **Workspace:** BM25 + semantic hybrid
- **Graph:** GraphRAG semantic with relationship awareness

---

## 4. Storage Layer Details

Located in: `packages/mastra-engine/src/agent/memory/storage.ts`

**Created by:** `createAgentStorage(agentId)`

**Database:** LibSQL (file-based SQLite)

**Structure:**
```typescript
{
  client: LibSQLClient,  // connection to {agentId}.db
  storage: {
    stores: {
      memory: LibSQLStore,  // message persistence
    },
  },
  vector: LibSQLVector,  // vector index + embeddings
}
```

**Embeddings:**
- **Model:** fastembed (all-minilm-l6-v2)
- **Unified instance:** Single embedder shared across all agent stores
- **Dimension:** 384
- **Storage:** LibSQLVector (same database)

**Consistency:**
- All stores reference the same LibSQL client
- Unified embedder prevents embedding inconsistency
- Per-agent database provides isolation

---

## 5. Integration in createAgent()

Located in: `packages/mastra-engine/src/create-forge-agent.ts`

**Full wiring:**

```typescript
export async function createAgent(config, options = {}) {
  // 1. Storage isolation
  const { client, storage, vector } = createAgentStorage(config.id);

  // 2. Communication (separate module, see docs/planning/communication-module.md)
  const communication = await createCommunicationModule({
    client,
    providers: config.providers ?? [],
  });

  // 3. Working memory
  const memory = createAgentMemory({ storage, vector });

  // 4. Observational memory (always enabled)
  const om = createObservationalMemory({
    storage,
    model: config.omModel ?? config.model,
  });

  // 5. Build processor list
  const inputProcessors = [om];
  const outputProcessors = [om];

  // 6. Optional long-term memory
  if (options.longTermMemory) {
    const ltm = await LongTermMemory.create({ agentId: config.id, om });
    inputProcessors.push(ltm);
    outputProcessors.push(ltm);
  }

  // 7. Create agent with all components
  const agent = new Agent({
    id: config.id,
    memory,
    inputProcessors,
    outputProcessors,
    tools: {
      ...createExternalAccountTools(communication),
      ...config.tools,
    },
    // ... other config
  });

  // 8. Wire wake queue
  const wakeQueue = createAgentWakeQueue({
    run: () => agent.generate('Pending external activity detected...', { maxSteps: 1000 }),
  });
  communication.onReceiveMessage(wakeQueue.notifyExternalEvent);

  return agent;
}
```

---

## 6. Configuration Options

### createAgent() Config

```typescript
interface CreateForgeAgentConfig {
  id: string;
  name: string;
  description?: string;
  instructions: string;
  model: string;
  omModel?: string;  // separate model for OM (optional)
  tools?: ToolsInput;
  providers?: CommunicationProvider[];
  // ... Mastra config
}

interface CreateAgentOptions {
  longTermMemory?: boolean;  // default: false
}
```

### createForgeAgent() Wrapper

Convenience function that automatically enables long-term memory:

```typescript
export async function createForgeAgent<...>(config, options = {}) {
  return createAgent(config, { longTermMemory: true, ...options });
}
```

---

## 7. Key Design Decisions

| Decision | Rationale |
| --- | --- |
| **Per-agent database** | Isolation, simpler backup/migration, no multi-tenant complexity |
| **Unified embedder** | Consistency across all vectors, no drift in semantic search |
| **Fastembed locally** | No API calls, fast embedding, good quality for agent use cases |
| **Optional long-term memory** | Not all agents need full hybrid search; reduces overhead |
| **Workspace as source of truth** | Durably stored markdown enables auditing, re-indexing, human review |
| **LibSQL for everything** | Single technology, no dependency complexity, works locally |
| **Processor pattern** | Leverages Mastra's standard system, easier to understand and maintain |

---

## 8. Future Enhancements

- **Observation de-duplication:** Hash-based comparison before new observations are indexed
- **Knowledge expiry:** TTL-based cleanup of old observations
- **Selective indexing:** `.forgeignore` patterns or config-based file filtering
- **Graph optimization:** Automatic node merging to reduce graph size over long-term use
