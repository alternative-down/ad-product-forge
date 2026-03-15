# Agent Runtime Architecture: Design Decisions

## Overview

This document explains the current architecture of the agent runtime system in `packages/mastra-engine`. It captures architectural decisions and explains why the system is structured as it is.

---

## Problem Statement

The system needed to support:
- **Persistent agents** with stable identity and state
- **Multiple memory layers** (working, observational, long-term)
- **External integrations** (Discord, internal chat)
- **Extensibility** for future providers and adapters
- **Single-thread operation** with per-step context recovery

---

## Key Architectural Decisions

### 1. Single Thread per Agent

**Decision:** Agents operate in a single thread, rather than cloning threads for execution isolation.

**Why:**
- Simplifies persistence and identity — the agent's state is directly the thread state
- Eliminates sync overhead and complexity
- Enables cleaner storage model

**Trade-off:** Task isolation is handled via context injection (LTM) and observation compression (OM), not thread-level separation.

---

### 2. Three-Layer Memory System

**Decision:** Memory is organized into three distinct layers with different responsibilities:

| Layer | Purpose | Technology |
| :--- | :--- | :--- |
| **Working Memory** | Current conversation state | Mastra's native `Memory` + LibSQLStore |
| **Observational Memory** | Compressed past interactions | Mastra `Processor` + LibSQLStore (memory table) |
| **Long-Term Memory** | Semantic recovery per step | Custom `Processor` + Workspace + Vector search |

**Why:**
- Each layer has a clear, minimal responsibility
- OM compresses; LTM recovers — this separation allows efficient storage and retrieval
- Per-step recovery (LTM) avoids stale context injection
- Layered design allows future improvements (e.g., better compression, different search strategies) without cascading changes

---

### 3. Processor-Based Integration

**Decision:** Memory functionality is implemented as Mastra `Processor` implementations, not custom hooks or overrides.

**Why:**
- Works *with* Mastra's lifecycle, not around it
- Automatic integration into `processInputStep` and `processOutputStep` hooks
- Type-safe and versioning-friendly
- Easier testing (processors are isolated)

---

### 4. Workspace as Source of Truth for Long-Term Knowledge

**Decision:** Observations are written to markdown files in `.forge-memory/<agentId>/observations/`, not just stored in a database.

**Why:**
- Enables auditing and manual inspection
- Supports re-indexing without losing original data
- Hybrid search (BM25 + semantic) is more powerful on filesystem-backed content
- Future-proof: can be migrated to other storage systems
- Observations are human-readable

---

### 5. Per-Step Query-Based Recovery

**Decision:** Each input step builds a fresh query from the last 8 messages and searches for context. Context is not pre-loaded or cached.

**Why:**
- Avoids injection of irrelevant context
- Adapts recovery to the current conversation direction
- Cleaner than trying to predict relevance upfront
- Lower latency on cache misses (search is fast for small datasets)

---

### 6. Dual Search (Workspace + Graph)

**Decision:** LTM uses both hybrid search (BM25 + semantic) on workspace files AND GraphRAG search on the vector index.

**Why:**
- Hybrid captures both exact matches (tasks, dates) and semantic similarity
- GraphRAG adds relationship-aware search (entities, concepts)
- Together they provide comprehensive recall coverage
- Failures in one search don't block the other (independent try-catch)

---

### 7. Metadata-Driven Observation Organization

**Decision:** Observations are grouped by date into separate files, with inline metadata headers.

Format:
```markdown
# Observations for {date}

## observation:{id}
Type: {originType}
CreatedAt: {timestamp}

{activeObservations}
```

**Why:**
- Enables efficient incremental updates (append only per date)
- Dates are natural query boundaries for workspace search
- Metadata enables filtering and later re-processing
- Markdown is universally readable

---

## Architectural Patterns

### Provider Factory Pattern

`createAgent` is the main factory:
```typescript
createAgent(config) {
  // 1. Create storage
  const storage = createAgentStorage(agentId);

  // 2. Create memory layers
  const om = createObservationalMemory({ storage, model });
  const ltm = await LongTermMemory.create({ agentId, om });

  // 3. Create Mastra Agent with processors
  const agent = new Agent({
    processors: [om, ltm],
    ...
  });

  // 4. Return configured runtime
  return new AgentRuntime(agent);
}
```

This pattern:
- Encapsulates configuration complexity
- Allows versioning (V1, V2 factories)
- Supports presets (`createForgeAgent`)

---

### Wake Queue Pattern

Agents are awakened via `createAgentWakeQueue`:

```typescript
{
  notifyExternalEvent() {
    // Debounces external events (1s), with max delay (10s)
    // Triggers agent.run() when ready
  }
}
```

**Why:**
- Prevents thrashing on rapid events
- Ensures agent runs with latest state
- No external job queue needed (suitable for single-agent deployments)

---

### Communication Module Pattern

Internal agent-agent communication is via `CommunicationModule`:
- Provides `send_message` and `finish` tools
- Agents can message each other synchronously
- Future: can be replaced with async queue (Bullmq, etc.)

---

## What's Not Here (Future)

The following are explicitly out of scope for the current architecture:

1. **Multiple agents per deployment** — Communication module is basic; scaling to many agents would require:
   - Job queue (Bullmq, Redis)
   - Agent registry
   - Event-driven wake (not polling)

2. **Agent-to-agent async messaging** — Current design is synchronous; async would require:
   - Message queue with persistence
   - Delivery guarantees
   - Retry logic

3. **Dynamic agent creation** — The runtime assumes static agent set at startup; dynamic creation would need:
   - Agent factory with versioning
   - Tenant isolation
   - On-demand storage/index creation

4. **Advanced provider adapters** — Only Discord and internal chat are implemented. Future adapters (Slack, Email, etc.) would follow the same pattern:
   - Normalize external event → `ExternalEvent`
   - Route to agent via `CommunicationModule`
   - Deliver responses back to provider

---

## Folder Structure

```
packages/mastra-engine/src/agent/
├── memory/
│   ├── long-term-memory.ts          # LTM processor
│   ├── observational-memory.ts      # OM configuration
│   ├── memory.ts                    # Working memory configuration
│   ├── storage.ts                   # Storage factory
│   └── working-memory.ts            # Template
├── wake-queue.ts                    # Event debouncing
├── communication/
│   ├── module.ts                    # Communication tools
│   ├── tools/                       # Individual tools
│   └── store.ts                     # Conversation store
├── integrations/
│   └── discord/                     # Discord adapter
└── tools/
    └── market-research.ts           # Agent-specific tools
```

---

## Conclusion

The current architecture balances **simplicity** (single thread, three memory layers, processor-based) with **power** (workspace-backed recovery, dual search, extensible factory pattern). It is suitable for single to few agents; scaling beyond that would require the architectural additions listed above.
