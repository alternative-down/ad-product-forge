# Engine Architecture Reference

**Status:** ✅ FULLY IMPLEMENTED

This document describes the actual architecture of the agent runtime, focusing on dependency injection, storage, and component integration.

## 1. Dependency Injection via Factory

The core pattern is the `createAgent()` factory in `packages/mastra-engine/src/create-forge-agent.ts`.

**Factory responsibilities:**

1. **Create storage** — LibSQL client, store, vector index
2. **Create communication module** — Provider registration, message orchestration
3. **Create memory system** — Working memory, observational memory
4. **Optionally create long-term memory** — Workspace and graph search
5. **Create wake queue** — Debounced external event processing
6. **Compose the agent** — Wire all components together
7. **Auto-install tools** — Communication tools via `createExternalAccountTools()`

**Result:** Zero coupling in the Agent class. All dependencies are injected from the factory.

```typescript
export async function createAgent<...>(config, options = {}) {
  // Storage isolation per agent
  const { client, storage, vector } = createAgentStorage(config.id);

  // Communication orchestration
  const communication = await createCommunicationModule({
    client,
    providers: config.providers ?? [],
  });

  // Memory with unified embeddings
  const memory = createAgentMemory({ storage, vector });
  const om = createObservationalMemory({ storage, model: config.omModel ?? config.model });

  // Optional long-term memory
  const inputProcessors: InputProcessorOrWorkflow[] = [om];
  const outputProcessors: OutputProcessorOrWorkflow[] = [om];
  if (options.longTermMemory) {
    const ltm = await LongTermMemory.create({ agentId: config.id, om });
    inputProcessors.push(ltm);
    outputProcessors.push(ltm);
  }

  // Compose agent with all dependencies
  const agent = new Agent({
    id: config.id,
    name: config.name,
    description: config.description,
    instructions: appendWorkingMemoryInstructions(config.instructions),
    model: config.model,
    tools: { ...createExternalAccountTools(communication), ...config.tools },
    memory,
    inputProcessors,
    outputProcessors,
  });

  // Wake queue for external event batching
  const wakeQueue = createAgentWakeQueue({
    run: () => agent.generate('Pending external activity detected...', { maxSteps: 1000 }),
  });
  communication.onReceiveMessage(wakeQueue.notifyExternalEvent);

  return agent;
}
```

`createForgeAgent()` is a convenience wrapper that automatically sets `longTermMemory: true`.

---

## 2. Storage Layer: LibSQL

Located in: `packages/mastra-engine/src/agent/memory/storage.ts`

**Characteristics:**
- File-based SQLite (one `.db` file per agent)
- Per-agent isolation
- Unified embedder instance (fastembed) shared across all agent stores

**Components:**

| Component | Purpose |
| --- | --- |
| **LibSQLClient** | SQLite connection and migration management |
| **LibSQLStore** | Message persistence for Mastra Memory |
| **LibSQLVector** | Vector index for semantic search |

**Storage structure:**

```text
createAgentStorage(agentId)
  ├─ client: LibSQL connection to {agentId}.db
  ├─ storage: { stores: { memory: LibSQLStore } }
  └─ vector: LibSQLVector (embeddings + search)
```

All agent data (messages, observations, vectors) lives in the same database file, avoiding fragmentation and simplifying backup/migration.

---

## 3. Communication Module

Located in: `packages/mastra-engine/src/agent/communication/module.ts`

**Responsibilities:**
- Register providers
- Manage the communication store (5 LibSQL tables)
- Orchestrate inbound message receipt
- Orchestrate outbound message sending
- Emit wake events to the wake queue

See `docs/planning/communication-module.md` for the full communication architecture.

---

## 4. Memory System

### Working Memory
Mastra's native `Memory` system. Persists current thread's message history and manages automatic context recall.

**Configuration:**
- Embedder: fastembed (unified instance)
- Storage: LibSQLStore
- lastMessages: unlimited
- semanticRecall: disabled (we use LTM instead)
- workingMemory: enabled with template injection

### Observational Memory (OM)
Mastra `Processor<'observational-memory'>` that automatically compresses past interactions.

**Configuration** (`observational-memory.ts`):
- Scope: 'thread'
- Observation: 15,000 tokens
- Reflection: 20,000 tokens
- Runs on every input/output step

### Long-Term Memory (LTM)
Custom `Processor<'long-term-memory'>` that provides hybrid semantic search.

**Configuration** (`long-term-memory.ts`):
- Workspace search: BM25 + semantic hybrid over markdown observation files
- Graph search: GraphRAG via LibSQLVector
- Searches on every input step
- Indexes new observations on every output step
- Stores observations in `.forge-memory/{agentId}/observations/{YYYY-MM-DD}.md`

See `docs/system/memory-and-context-architecture.md` for detailed memory flow.

---

## 5. Wake Queue

Located in: `packages/mastra-engine/src/agent/wake-queue.ts`

**Purpose:** Debounce external message events to prevent redundant agent wake-ups.

**Configuration:**
- Debounce: 1000ms
- Max delay: 10000ms
- Trigger: `agent.generate()` with "Pending external activity detected.\n\nCheck your messages, inspect what is pending, and process what matters." prompt

**Integration:**
```typescript
communication.onReceiveMessage(wakeQueue.notifyExternalEvent)
```

---

## 6. Architecture Diagram

```text
createAgent(config)
  ↓
  ├─ createAgentStorage(agentId)
  │  ├─ LibSQL client → {agentId}.db
  │  ├─ LibSQLStore for messages
  │  └─ LibSQLVector for embeddings
  │
  ├─ createCommunicationModule({ client, providers })
  │  ├─ Communication store (5 tables)
  │  ├─ Provider registry
  │  └─ Inbound/outbound orchestration
  │
  ├─ createAgentMemory({ storage, vector })
  │  └─ Working memory + current thread
  │
  ├─ createObservationalMemory({ storage, model })
  │  └─ Automatic observation compression (processor)
  │
  ├─ [Optional] LongTermMemory.create({ agentId, om })
  │  └─ Workspace + graph search processor
  │
  ├─ createAgentWakeQueue({ run })
  │  └─ Debounced external event handling
  │
  └─ new Agent({...})
     ├─ Mastra Agent instance
     ├─ inputProcessors: [OM, LTM?]
     ├─ outputProcessors: [OM, LTM?]
     ├─ tools: communication tools + user tools
     └─ memory: working memory + thread history
```

---

## 7. Design Principles

1. **Decoupling:** Factory creates all dependencies; no coupling in Agent itself
2. **Per-agent isolation:** Each agent has its own database and storage
3. **Unified embeddings:** Single fastembed instance prevents inconsistency
4. **Processor pattern:** Memory and external integrations via Mastra's standard processor system
5. **Explicit persistence:** All state changes immediately persisted to LibSQL
6. **Wake on demand:** External events trigger agent generation, not continuous polling

---

## 8. Future Considerations

- **Observation de-duplication:** Hash-based comparison before indexing new observations
- **Workspace ignore patterns:** `.forgeignore` or config-based file filtering
- **Knowledge expiry:** TTL on observations for automatic cleanup
- **Graph optimization:** Node merging to reduce graph size over time
