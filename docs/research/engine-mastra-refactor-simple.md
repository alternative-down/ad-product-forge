# Engine-Mastra: Current Implementation (V3)

**Status:** This document describes the simplified approach that was implemented, moving away from complex refactoring proposals.

## Current Architecture

The engine now follows Mastra's standard patterns more directly:

### 1. Agent Creation: `createAgent()` and `createForgeAgent()`

Located in `packages/mastra-engine/src/create-forge-agent.ts`:

```typescript
export async function createAgent<...>(config, options = {}): Promise<Agent> {
  // Storage: Uses LibSQL (not GraphIntegrator)
  const { client, storage, vector } = createAgentStorage(config.id);

  // Communication module handles external integrations
  const communication = await createCommunicationModule({
    client,
    providers: config.providers ?? [],
  });

  // Memory system with storage and vector embeddings
  const memory = createAgentMemory({ storage, vector });
  const om = createObservationalMemory({
    storage,
    model: config.omModel ?? config.model,
  });

  // Input/Output processors for memory
  const inputProcessors: InputProcessorOrWorkflow[] = [om];
  const outputProcessors: OutputProcessorOrWorkflow[] = [om];

  // Optional: Long-term memory layer
  if (options.longTermMemory) {
    const longTermMemory = await LongTermMemory.create({ agentId: config.id, om });
    inputProcessors.push(longTermMemory);
    outputProcessors.push(longTermMemory);
  }

  // Create agent with Mastra's standard Agent class
  const agent = new Agent({...});

  // Wake queue for debounced external event processing
  const wakeQueue = createAgentWakeQueue({
    run: () => agent.generate('Pending external activity...', {...})
  });
}
```

### 2. Storage Layer: LibSQL

Located in `packages/mastra-engine/src/agent/memory/storage.ts`:

- Uses `@libsql/client` for local SQLite databases
- `LibSQLStore` for key-value message storage
- `LibSQLVector` for vector embeddings
- Database path: `{agentId}.db` in current working directory

### 3. Wake Queue: Debounce Mechanism

Located in `packages/mastra-engine/src/agent/wake-queue.ts`:

- Simple debounced event notification
- WAKE_DEBOUNCE_MS = 1000 (1 second debounce)
- WAKE_MAX_DELAY_MS = 10000 (max 10 seconds before forced trigger)
- Used to batch external messages and reduce unnecessary processing

### 4. OAuth Gateway: Token Management

Located in `packages/mastra-engine/src/llm/oauth-gateway.ts`:

- Handles credentials for both Anthropic (Claude) and OpenAI Codex
- Token refresh with stored credentials in `~/.mastra-engine/oauth.json`
- Middleware for request/response transformation
- Prompt caching support for Claude models

## Design Decisions

**Simplicity over Complexity:**
- No `IKnowledgeGraph` abstraction - use Mastra's standard patterns
- No `contextBuilder` - handle memory via processors
- No lifecycle managers - leverage Mastra's orchestration

**Storage Focus:**
- LibSQL for persistence (local development, single-machine friendly)
- Vector embeddings via Mastra's built-in support
- Message threading within agents

**Token Management:**
- Centralized OAuth gateway
- Automatic refresh with skew-aware expiry
- Secure file storage (mode 0o600)
