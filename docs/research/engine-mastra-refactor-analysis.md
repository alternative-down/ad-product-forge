# Engine-Mastra Refactoring Analysis

**Status:** ARCHIVED PROPOSAL - These are refactoring ideas from earlier analysis. The current implementation has simplified to focus on core functionality using Mastra's standard patterns.

## Historical Issues (May Be Partially Resolved)

The issues below were identified in early analysis of agent architecture. The current implementation has largely moved away from these patterns toward simpler, Mastra-native approaches.

### Historical Issues (No Longer Applicable)

1. **Tight Coupling EngineAgent ↔ GraphIntegrator** - Resolved by using Mastra's processor system instead of custom graph integration.

2. **Embedder Duplication** - Not applicable; current code uses LibSQL's built-in vector support.

3. **HybridRecallProcessor Manual XML Injection** - Not in current codebase; replaced with Mastra processor pattern.

4. **Conflicting Ingestión Flows** - Simplified; GraphIntegrator not used in current code.

5. **GraphIntegrator Chunking** - Not applicable; current approach uses Mastra's standard patterns.

---

## Current Implementation Status

The current implementation in `packages/mastra-engine/src/` uses a simpler approach aligned with Mastra's standard patterns:

- **Agent Creation:** `createAgent()` and `createForgeAgent()` in `create-forge-agent.ts` use Mastra's native `Agent` class with processors
- **Storage:** `createAgentStorage()` uses LibSQL for persistence (not GraphIntegrator)
- **Memory:** Leverages Mastra's `LibSQLStore` and `LibSQLVector` via `@mastra/libsql`
- **Wake Queue:** Debounced external event notification without complex manager patterns
- **OAuth:** Unified `OAuthGateway` for token management across providers

### Key Design Decisions

1. **Processor Pattern:** Memory and external integrations handled via Mastra's input/output processor system
2. **Storage Abstraction:** LibSQL for local persistence; no multi-level abstraction layers
3. **Token Management:** Centralized OAuth gateway with automatic refresh
4. **Event Handling:** Simple debounced wake queue (1s debounce, 10s max delay)

---

## Archived Refactoring Proposals

The sections below document refactoring ideas from earlier analysis. Many concepts have been superseded by the current simplified architecture.

### Proposal: Dependency Injection for Components

**Earlier Idea:**
```typescript
interface EngineConfig {
  memory: Memory;
  graph: GraphRAGInterface;
  workspace: Workspace;
  omProcessor: ObservationalMemory;
}
```

**Current Reality:**
Mastra's `Agent` class and processor system already provide composition. Dependency injection is achieved through the `createAgent()` factory function rather than explicit DI patterns.

### Proposal: Abstraction Layer for Graph

**Earlier Idea:**
```typescript
interface IKnowledgeGraph {
  ingestText(text: string, metadata: Record<string, any>): Promise<void>;
  query(queryText: string, options?: QueryOptions): Promise<GraphQueryResult>;
}
```

**Current Reality:**
Not needed in current implementation. Memory and context handling is done via Mastra's processor system.

### Proposal: HybridRecallProcessor as Context Builder

**Earlier Idea:**
Use `contextBuilder` pattern to avoid manual XML injection.

**Current Reality:**
Not in current codebase. The processor system handles context via input/output processing.

### Proposal: KnowledgeGraph Lifecycle Manager

**Earlier Idea:**
Complex manager for ingest strategies and de-duplication.

**Current Reality:**
Simplified to direct agent construction via `createAgent()` factory.

---

## Takeaway

The current implementation prioritizes:
- ✅ Simplicity (fewer abstractions)
- ✅ Standards (Mastra patterns)
- ✅ Testability (factory-based composition)
- ✅ Clarity (fewer layers)

Rather than:
- ❌ Excessive abstraction
- ❌ Complex manager patterns
- ❌ Manual dependency injection

If future requirements demand more flexibility, these abstraction patterns can be reintroduced with careful consideration.
