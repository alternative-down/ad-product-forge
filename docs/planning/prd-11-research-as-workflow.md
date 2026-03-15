# PRD-11: Research as Workflow

**Status:** Draft — Specification Phase

**Date:** 2026-03-15

**Owner:** Product Team

**Related Features:**
- Opportunity Radar (passive input source)
- Agent Execution Model (workflow orchestration)
- External Webhooks (trigger research flows)

---

## 1. Executive Summary

Transform the current Research tool from a simple utility function into a first-class Workflow primitive. This enables complex research orchestration (sequential steps, conditional branching, aggregation) while maintaining the simplicity of the tool for basic use cases.

**Core Value:**
- Research becomes composable (chain multiple research tasks)
- Enable conditional workflows (if X then research Y)
- Support aggregation (combine research results)
- Maintain backward compatibility with existing tool usage

**Timeline:** Q2 2026 (Phase 1 foundation)

---

## 2. Problem Statement

### 2.1 Current State

Research exists as a **tool** in the Mastra agent framework:
```typescript
tools: {
  research: async (query: string) => Promise<ResearchResult>
}
```

**Limitations:**
- Single-shot query execution only
- No sequential orchestration (can't chain research queries)
- No conditional logic (can't branch based on intermediate results)
- No result aggregation (can't combine multiple research streams)
- No explicit step tracking or error recovery
- Limited to direct tool invocation, not reusable workflows

### 2.2 Desired Capability

Need to support research scenarios like:
1. **Sequential research**: Research topic A → refine based on results → research subtopic B
2. **Conditional research**: If market size > X, then research competitors
3. **Multi-source research**: Parallelize searches across 3 different angles, then combine
4. **Iterative research**: Loop N times with feedback refinement
5. **Resource-aware research**: Check cost/time budget before continuing

### 2.3 Why Workflows?

Workflows provide:
- **Explicit state management** — Track what's completed, in-progress, failed
- **Deterministic execution** — Reproducible, auditable research paths
- **Error recovery** — Retry failed steps, skip expensive operations
- **Composition** — Reuse workflows as building blocks
- **Visibility** — Clear logs of every step, decision, and result
- **Optimization** — Share research results across parallel paths

---

## 3. Goals & Success Criteria

### 3.1 Primary Goals

1. **Enable workflow-based research** — Create Research Workflow abstraction
   - Goal: All complex research scenarios representable as workflows
   - Success: Support sequential, conditional, and parallel research steps

2. **Maintain backward compatibility** — Existing tool calls still work
   - Goal: No breaking changes to agent code
   - Success: `agent.generate()` with research tool works unchanged

3. **Provide research-specific primitives** — Domain-optimized workflow nodes
   - Goal: Research workflows feel natural to write/read
   - Success: Built-in nodes for query, filter, aggregate, rank

4. **Enable research orchestration** — Complex multi-step research flows
   - Goal: Users can build and reuse research workflows
   - Success: Pre-built workflows for common patterns (competitor analysis, market sizing, etc.)

### 3.2 Success Metrics

| Metric | Target | Notes |
| --- | --- | --- |
| Research tool adoption | 100% of agents | Via backward-compatible interface |
| Workflow creation time | < 5 min for common patterns | Pre-built templates provided |
| Step execution latency | < 500ms overhead | Minimal workflow frame overhead |
| Error recovery rate | > 95% | Failed steps auto-retried with backoff |
| Research result reuse | > 60% of multi-step workflows | Deduplication across parallel steps |

---

## 4. Scope & Definitions

### 4.1 What's Included

**In Scope for MVP (Phase 1):**
- Research workflow type definition
- Sequential and conditional step execution
- Result aggregation for multiple queries
- Integration with existing Mastra workflow engine
- Tool interface (backward compatible)
- Error handling and retry logic
- Basic step caching (avoid duplicate queries)

**Deferred (Phase 2+):**
- Parallel step execution with cost optimization
- Advanced ranking and synthesis
- Real-time result streaming
- Custom research plugins
- UI/visualization for workflow design

### 4.2 What's Excluded

- New search engines or data sources (uses existing tools)
- ML-based summarization (uses agent LLM capability)
- Persistent workflow templates (CRUD interface later)
- Workflow versioning and rollback
- Cost prediction before execution

### 4.3 Key Definitions

| Term | Definition |
| --- | --- |
| **Research Workflow** | Deterministic, DAG-based sequence of research steps with conditional branching |
| **Research Step** | Single unit of research: query, filter, aggregate, or custom logic |
| **Research Result** | Structured output from a step (document list, insights, formatted text) |
| **Result Cache** | Per-workflow deduplication to avoid redundant queries |
| **Step State** | pending, in-progress, completed, failed, skipped |

---

## 5. Target Users & Use Cases

### 5.1 Primary Users

1. **Research Agents** — Specialized agents that perform research-heavy tasks
   - Example: Market research agent
   - Example: Competitor analysis agent
   - Example: Knowledge synthesis agent

2. **Agent Operators** — Define and orchestrate research workflows for other agents
   - Example: Define "market sizing" workflow once, reuse across projects
   - Example: Chain workflows for complex research chains

3. **Autonomous Developers** — Build feature requirements via research workflows
   - Example: Research user pain points → competitor features → market sizing → requirements synthesis

### 5.2 Use Cases

#### Use Case 1: Competitor Analysis Workflow
```
START
├─ Step 1: Query "competitors in [market]"
├─ Step 2: If result.count > 5 then filter to "top competitors"
├─ Step 3: For each competitor, query "pricing and features"
├─ Step 4: Aggregate results into comparison table
└─ END
```

#### Use Case 2: Market Sizing with Refinement
```
START
├─ Step 1: Query "market size [industry] [geography]"
├─ Step 2: If confidence < 0.7 then query "alternative market size estimates"
├─ Step 3: Aggregate results, average estimates
└─ END
```

#### Use Case 3: Iterative Problem Discovery
```
START
├─ Loop iteration=1 to 3:
│  ├─ Step: Query "problems in [domain]" with iteration-specific prompt
│  └─ Step: Extract new problems not seen in previous iterations
├─ Step: Deduplicate and rank all problems
└─ END
```

#### Use Case 4: Research-to-Requirements
```
START
├─ Execute competitor_analysis_workflow
├─ Execute market_sizing_workflow
├─ Step: Synthesize research results into feature requirements
└─ END
```

---

## 6. Feature Description & Functional Requirements

### 6.1 Architecture Overview

```
Agent.generate(prompt)
  ├─ Tools include: research(query)
  │
  └─ If prompt references workflow:
      │
      └─ Workflow Engine
          ├─ Parse workflow definition
          ├─ Initialize step state
          ├─ For each step:
          │  ├─ Check dependencies (conditional branching)
          │  ├─ Execute step (invoke research or custom logic)
          │  ├─ Store result with dedup key
          │  ├─ Update step state
          │  └─ Handle errors (retry or skip)
          ├─ Aggregate final results
          └─ Return composite result
```

### 6.2 Research Workflow Schema (TypeScript)

```typescript
// Core workflow definition
type ResearchWorkflow = {
  id: string;                          // Workflow identifier
  name: string;                        // Human-readable name
  description?: string;                // Purpose and use
  version: string;                     // Semantic version
  steps: ResearchStep[];               // Ordered steps
  config?: WorkflowConfig;             // Runtime configuration
};

// Individual step
type ResearchStep = {
  id: string;                          // Step identifier (unique within workflow)
  type: 'query' | 'filter' | 'aggregate' | 'custom';

  // Query step: invoke research tool
  ...(type: 'query') => {
    query: string;                     // Research query (supports variable substitution: {step.id})
    timeout?: number;                  // Max time to wait (ms)
    retries?: number;                  // Auto-retry on failure
  };

  // Filter step: select/rank results from previous step
  ...(type: 'filter') => {
    sourceStep: string;                // Which step's results to filter
    criteria: string;                  // Filtering logic (LLM instruction or predicate)
    limit?: number;                    // Keep top N results
  };

  // Aggregate step: combine results from multiple steps
  ...(type: 'aggregate') => {
    sourceSteps: string[];             // Which steps to combine
    format: 'list' | 'comparison' | 'summary' | 'structured';
    template?: string;                 // Custom output format
  };

  // Custom step: arbitrary logic
  ...(type: 'custom') => {
    fn: (context: WorkflowContext) => Promise<any>;  // Custom handler
  };

  // Conditional execution
  conditions?: WorkflowCondition[];     // If any false, skip this step

  // Dependencies (implicit from sourceStep refs, or explicit)
  dependsOn?: string[];                // Wait for these steps first
};

// Conditional logic
type WorkflowCondition = {
  step: string;                        // Which step's result to check
  operator: 'equals' | 'contains' | 'greaterThan' | 'custom';
  value: any;                          // Expected value
  fn?: (result: any) => boolean;       // Custom predicate
};

// Execution context passed to steps
type WorkflowContext = {
  stepId: string;                      // Current step
  workflowId: string;                  // Workflow being executed
  results: Record<string, StepResult>; // All previous step results
  config: WorkflowConfig;              // Workflow config
  variables: Record<string, any>;      // User-provided variables
};

// Result of a single step
type StepResult = {
  stepId: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed' | 'skipped';
  output: any;                         // Raw step output
  dedupKey?: string;                   // Hash for caching
  duration: number;                    // Execution time (ms)
  error?: string;                      // If failed
  retryCount: number;                  // How many retries attempted
};

// Workflow execution result
type WorkflowResult = {
  workflowId: string;
  status: 'completed' | 'partial' | 'failed';
  steps: Map<string, StepResult>;      // All step results
  finalResult: any;                    // Output of last step
  duration: number;                    // Total execution time
  cache: {
    hits: number;                      // Dedup cache hits
    dedupKeysUsed: Set<string>;        // Which queries were deduplicated
  };
};

// Runtime configuration
type WorkflowConfig = {
  timeout?: number;                    // Total workflow time budget (ms)
  maxRetries?: number;                 // Default retries per step
  cache?: boolean;                     // Enable result deduplication
  parallel?: boolean;                  // [Phase 2] Parallel step execution
  costBudget?: number;                 // [Phase 2] Max token spend
};
```

### 6.3 Functional Requirements

#### FR1: Workflow Definition
- **Requirement**: Users can define research workflows in TypeScript
- **Implementation**: Export `defineResearchWorkflow()` helper
- **Example**:
```typescript
const marketSizingWorkflow = defineResearchWorkflow({
  id: 'market-sizing-v1',
  name: 'Market Sizing',
  steps: [
    {
      id: 'research-primary',
      type: 'query',
      query: 'What is the market size for {market}?',
    },
    {
      id: 'research-secondary',
      type: 'query',
      query: 'Alternative estimates for {market} market size',
      conditions: [{
        step: 'research-primary',
        operator: 'custom',
        fn: (result) => !result.includes('billion') // Low confidence
      }],
    },
    {
      id: 'synthesize',
      type: 'aggregate',
      sourceSteps: ['research-primary', 'research-secondary'],
      format: 'summary',
    },
  ],
});
```

#### FR2: Backward Compatibility
- **Requirement**: Existing agent tools still work unchanged
- **Implementation**:
  - `research(query)` tool still available as single-step convenience
  - Workflows are opt-in via `useResearchWorkflow(workflow, variables)`
  - Agent code requires no changes

#### FR3: Sequential Execution
- **Requirement**: Steps execute in dependency order
- **Implementation**:
  - Build dependency graph from step references
  - Execute steps only after dependencies complete
  - Return error if circular dependency detected

#### FR4: Conditional Branching
- **Requirement**: Skip steps based on conditions
- **Implementation**:
  - Evaluate conditions before step execution
  - Skip if condition false, mark as `skipped`
  - Support custom predicates

#### FR5: Result Aggregation
- **Requirement**: Combine results from multiple steps
- **Implementation**:
  - `aggregate` step type merges outputs
  - Support multiple formats: list, comparison, summary
  - Use LLM for intelligent synthesis if needed

#### FR6: Result Deduplication
- **Requirement**: Avoid duplicate research queries within workflow
- **Implementation**:
  - Hash each research query (query text + parameters)
  - Store results in per-workflow cache
  - Return cached result if seen before
  - Expose cache hit stats in result

#### FR7: Error Handling & Retry
- **Requirement**: Recover from transient failures
- **Implementation**:
  - Auto-retry failed steps with exponential backoff (1s, 2s, 4s, max 10s)
  - Configurable `maxRetries` per step
  - Fail fast if retries exhausted or max time exceeded
  - Log detailed error info

#### FR8: Step State Tracking
- **Requirement**: Know execution status of each step
- **Implementation**:
  - Track state: pending → in-progress → completed|failed|skipped
  - Return state in `WorkflowResult`
  - Persisted to agent memory for audit trail

#### FR9: Variable Substitution
- **Requirement**: Parameterize workflows
- **Implementation**:
  - Support `{variableName}` in step queries
  - Replace at execution time
  - Example: `Query: "Market size for {market}"` → `"Market size for SaaS"`

#### FR10: Timeout Management
- **Requirement**: Prevent runaway workflows
- **Implementation**:
  - Total workflow timeout (default 5 min)
  - Per-step timeout (default 1 min)
  - Cancel remaining steps if budget exceeded

---

## 7. Design & Technical Approach

### 7.1 Architecture Components

#### 1. Workflow Definition & Parser
- **File**: `packages/mastra-engine/src/workflows/research/definition.ts`
- **Exports**: `defineResearchWorkflow()`, schema validation
- **Input**: Plain TypeScript object (no parsing needed)
- **Output**: Validated `ResearchWorkflow` instance

#### 2. Workflow Engine
- **File**: `packages/mastra-engine/src/workflows/research/engine.ts`
- **Exports**: `executeResearchWorkflow(workflow, context)`
- **Logic**:
  - Build dependency graph
  - Execute steps in topological order
  - Evaluate conditions before each step
  - Handle retries and timeouts
  - Aggregate results

#### 3. Step Executors
- **File**: `packages/mastra-engine/src/workflows/research/steps/`
- **Exports**: Executor for each step type (query, filter, aggregate, custom)
- **Pattern**: `type StepExecutor = (step, context) => Promise<StepResult>`

#### 4. Result Cache
- **File**: `packages/mastra-engine/src/workflows/research/cache.ts`
- **Exports**: `ResultCache` class
- **Logic**:
  - Deduplicate queries by hash
  - Store results per workflow
  - Configurable TTL (default: lifetime of workflow)

#### 5. Integration with Agent
- **File**: `packages/mastra-engine/src/create-forge-agent.ts` (extend)
- **Change**: Add optional `workflows` to agent config
- **Tool**: Expose `useResearchWorkflow(workflow, variables)` to agent

### 7.2 Execution Flow

```
Agent.generate("Execute market-sizing workflow for SaaS")
  ↓
Agent detects workflow reference (or explicit useResearchWorkflow call)
  ↓
executeResearchWorkflow(marketSizingWorkflow, { market: 'SaaS' })
  ├─ Validate workflow definition
  ├─ Build dependency DAG
  ├─ Initialize step states
  │
  ├─ For each step in topological order:
  │  ├─ Evaluate conditions
  │  ├─ If condition false: mark as skipped, continue
  │  ├─ Substitute variables in query
  │  ├─ Check result cache
  │  ├─ If cache hit: return cached result
  │  ├─ If cache miss:
  │  │  ├─ Execute step (query → invoke research tool)
  │  │  ├─ Store result in cache
  │  │  ├─ Update step state
  │  │  └─ Handle errors (retry with backoff)
  │  ├─ Collect step result
  │  └─ Check timeout (fail if exceeded)
  │
  ├─ Aggregate results (if final step is aggregate type)
  └─ Return WorkflowResult
     ├─ All step results
     ├─ Final output
     ├─ Cache stats
     └─ Duration
```

### 7.3 Data Persistence

**What to persist:**
- Workflow executions → Agent's communication/thread store
- Step states → ObservationalMemory (for audit trail)
- Result cache → Per-workflow, in-memory only (not persistent)

**How:**
- Store full `WorkflowResult` in agent memory
- Include in agent's observational memory for future reference
- Reference workflow results in output messages

### 7.4 Error Handling Strategy

| Error Type | Handling | Config |
| --- | --- | --- |
| Network timeout | Retry with backoff | `maxRetries`, `timeout` |
| Rate limit (429) | Exponential backoff | Built-in, respects API limits |
| Invalid query | Fail immediately | No retry |
| LLM error | Retry with reduced tokens | `maxRetries` |
| Step timeout | Fail, continue to next | `timeout` per step |
| Circular dependency | Fail at parse time | Validation |

### 7.5 Performance Considerations

**Query Deduplication:**
- Hash function: `SHA256(stepType + query + JSON(params))`
- Cache key: `{workflowId}:{hash}`
- Expected benefit: 30–60% reduction in API calls for multi-step workflows

**Execution Overhead:**
- Workflow engine: ~50–100ms (dependency resolution, step routing)
- Per-step overhead: ~10–20ms (state tracking, condition evaluation)
- Total: ~200ms for typical 5-step workflow

**Memory Usage:**
- Per workflow instance: ~100–500KB (results + state)
- Persistent memory (agent store): ~1KB per workflow execution log

---

## 8. User Experience & Interaction

### 8.1 For Agents (Programmatic Usage)

**Simple workflow execution (in agent code):**
```typescript
const result = await useResearchWorkflow(marketSizingWorkflow, {
  market: 'Enterprise SaaS',
  geography: 'North America',
});

// Use result
console.log(result.finalResult); // Synthesized market size
console.log(result.cache.hits);  // How many deduplicated queries
```

**Define and execute inline:**
```typescript
const result = await executeResearchWorkflow({
  id: 'quick-research',
  steps: [
    { id: 'q1', type: 'query', query: 'What is {topic}?' },
    { id: 'q2', type: 'query', query: 'Why is {topic} important?' },
    { id: 'agg', type: 'aggregate', sourceSteps: ['q1', 'q2'], format: 'summary' },
  ],
}, { topic: 'GraphRAG' });
```

### 8.2 For Operators (Reusable Workflows)

**Define once, import everywhere:**
```typescript
// workflows/market-sizing.ts
export const marketSizingWorkflow = defineResearchWorkflow({...});
export const competitorAnalysisWorkflow = defineResearchWorkflow({...});

// agent-config.ts
const agent = await createForgeAgent({
  workflows: [marketSizingWorkflow, competitorAnalysisWorkflow],
  tools: { ... },
});
```

### 8.3 Future: UI/Workflow Designer

(Phase 2+)
- Visual workflow builder (drag-drop steps, connect with arrows)
- Pre-built template library
- Execution history and step debugging
- Performance metrics (cache hit rate, execution time, etc.)

---

## 9. Dependencies & Integration Points

### 9.1 Internal Dependencies

| Component | Dependency | Usage |
| --- | --- | --- |
| Workflow Engine | Research Tool | Invoke research(query) from query steps |
| Workflow Engine | Agent Memory | Persist execution logs |
| Workflow Engine | LLM (agent's model) | Synthesize/aggregate results if needed |
| Workflow Engine | Wake Queue | Notify when long workflows complete |

### 9.2 External Dependencies

- **Mastra Agent Framework**: Workflows extend Mastra's native workflow support
- **Research Tool**: Existing research infrastructure (HTTP client, search API)
- **FastEmbed**: For query hashing and dedup key generation

### 9.3 Non-Dependencies (Out of Scope)

- Does NOT require new database schema (uses existing agent memory store)
- Does NOT require new LLM models (uses agent's configured model)
- Does NOT require new external services (works with existing research sources)

---

## 10. Timeline & Roadmap

### Phase 1 (Q2 2026): MVP Foundation
**Duration**: 4–6 weeks

**Goals:**
- Basic workflow definition and execution
- Sequential steps with conditional branching
- Result aggregation
- Backward compatibility with existing research tool

**Deliverables:**
- Workflow engine implementation
- Step executors (query, filter, aggregate)
- Result cache and deduplication
- Agent integration
- Tests and documentation

**Metrics:**
- All use cases (competitor analysis, market sizing) fully supported
- < 5 min to create new workflow
- 0 breaking changes to existing code

### Phase 1.5 (Q2 2026): Polish & Optimization
**Duration**: 2 weeks

**Goals:**
- Performance optimization (reduce engine overhead)
- Enhanced error handling (better failure messages)
- Observability (detailed execution logs)

**Deliverables:**
- Performance benchmarks and optimization
- Enhanced error recovery
- Execution telemetry

### Phase 2 (Q3 2026): Advanced Capabilities
**Duration**: 6–8 weeks

**Goals:**
- Parallel step execution with cost optimization
- Workflow versioning and templates
- UI workflow designer (experimental)

**Deliverables:**
- Parallel execution engine
- Cost prediction and budgeting
- Workflow template library
- Basic UI prototype

### Phase 3 (Q4 2026+): Production Scale
**Duration**: Ongoing

**Goals:**
- Community workflows library
- Advanced synthesis (RAG-based aggregation)
- Workflow marketplace

**Deliverables:**
- Ecosystem features
- Documentation and examples
- Community support

---

## 11. Metrics & Success Criteria

### 11.1 Adoption Metrics

| Metric | Target | Measurement |
| --- | --- | --- |
| Workflow creation rate | ≥ 5 new workflows/week | Count in team workflow repo |
| Workflow reuse rate | ≥ 3 agents per workflow | Telemetry from agent execution |
| Research tool adoption | 100% via backward-compat | Tool invocation logs |
| Workflow error rate | < 1% | Failed executions / total executions |

### 11.2 Performance Metrics

| Metric | Target | Measurement |
| --- | --- | --- |
| Execution latency | < 2s per step (query) | Aggregate duration in result |
| Cache hit rate | > 40% for multi-step workflows | result.cache.hits / total steps |
| Engine overhead | < 200ms per workflow | Subtract actual step times from total |
| Memory usage | < 500KB per workflow | Memory profiler on execution |

### 11.3 Quality Metrics

| Metric | Target | Measurement |
| --- | --- | --- |
| Step success rate | > 95% | (completed + skipped) / total steps |
| Retry effectiveness | > 80% | Retries that succeed / all retries |
| Test coverage | > 85% | Code coverage report |
| Documentation completeness | 100% | API docs + examples for all features |

---

## 12. Risks & Mitigation

### Risk 1: Performance Degradation
**Risk**: Workflow engine overhead makes research slower than direct tool invocation

**Probability**: Medium | **Impact**: High

**Mitigation**:
- Benchmark engine overhead early (Phase 1)
- Optimize hot paths (dependency resolution, caching)
- Measure and report performance metrics
- Fallback: Allow direct tool usage if workflow overhead unacceptable

### Risk 2: Adoption Friction
**Risk**: Operators don't adopt workflows; prefer direct tool invocation

**Probability**: Medium | **Impact**: Medium

**Mitigation**:
- Provide pre-built template library (Phase 1)
- Make workflow definition simple and intuitive
- Document common patterns with examples
- Gather feedback early and iterate

### Risk 3: Complex Debugging
**Risk**: Multi-step workflows harder to debug; unclear which step failed

**Probability**: Medium | **Impact**: Low

**Mitigation**:
- Rich execution logs with step-by-step results
- Error messages pinpoint failing step and reason
- Observability: trace each step in agent memory
- Debug mode: dry-run workflow with logging

### Risk 4: Circular Dependencies
**Risk**: Operators define workflows with circular step dependencies

**Probability**: Low | **Impact**: High

**Mitigation**:
- Validate DAG structure at parse time
- Catch and reject circular dependencies with clear error
- Provide validation tool/linter

### Risk 5: Cost Explosion
**Risk**: Parallel steps (Phase 2) cause unexpected token/API cost

**Probability**: Low | **Impact**: High

**Mitigation**:
- Cost budgeting built-in from Phase 1
- Warn before exceeding budget
- Cancel remaining steps if budget exceeded
- Expose cost stats in result

---

## 13. Appendices

### Appendix A: Glossary

| Term | Definition |
| --- | --- |
| **Dedup Key** | Hash of query + params to identify duplicate research tasks |
| **Topological Order** | Dependency-respecting execution order (independent steps before dependents) |
| **Condition Evaluation** | Boolean check at step start; if false, skip step |
| **Cache Hit** | Step skipped because identical query already executed in workflow |
| **Step State** | Current status of a step (pending, in-progress, completed, failed, skipped) |

### Appendix B: Example Workflows

#### B.1: Competitor Analysis Workflow
```typescript
export const competitorAnalysisWorkflow = defineResearchWorkflow({
  id: 'competitor-analysis-v1',
  name: 'Competitor Analysis',
  description: 'Research competitors in a market and compare features/pricing',
  steps: [
    {
      id: 'research-competitors',
      type: 'query',
      query: 'List the top competitors in the {market} market',
    },
    {
      id: 'research-features',
      type: 'query',
      query: 'For each competitor: list key features and pricing',
      dependsOn: ['research-competitors'],
    },
    {
      id: 'compare',
      type: 'aggregate',
      sourceSteps: ['research-competitors', 'research-features'],
      format: 'comparison',
      template: `
        | Competitor | Features | Pricing | Market Position |
        | --- | --- | --- | --- |
        {rows}
      `,
    },
  ],
});
```

#### B.2: Iterative Problem Discovery
```typescript
export const iterativeProblemDiscoveryWorkflow = defineResearchWorkflow({
  id: 'problem-discovery-v1',
  name: 'Iterative Problem Discovery',
  description: 'Discover problems through multiple research passes',
  steps: [
    {
      id: 'research-pass-1',
      type: 'query',
      query: 'What are the top problems in {domain}?',
    },
    {
      id: 'research-pass-2',
      type: 'query',
      query: 'What problems in {domain} are not commonly discussed?',
      conditions: [{ step: 'research-pass-1', operator: 'contains', value: 'problems' }],
    },
    {
      id: 'research-pass-3',
      type: 'query',
      query: 'What emerging problems in {domain} are still being discovered?',
      conditions: [{ step: 'research-pass-2', operator: 'contains', value: 'problems' }],
    },
    {
      id: 'synthesize',
      type: 'aggregate',
      sourceSteps: ['research-pass-1', 'research-pass-2', 'research-pass-3'],
      format: 'summary',
      template: 'Consolidated list of unique problems across all passes: {list}',
    },
  ],
});
```

#### B.3: Market Sizing with Refinement
```typescript
export const marketSizingWorkflow = defineResearchWorkflow({
  id: 'market-sizing-v1',
  name: 'Market Sizing with Refinement',
  description: 'Research market size with fallback to secondary sources if needed',
  steps: [
    {
      id: 'primary-research',
      type: 'query',
      query: 'What is the current market size for {market}?',
      timeout: 30000,
    },
    {
      id: 'secondary-research',
      type: 'query',
      query: 'Alternative market size estimates and forecasts for {market}',
      conditions: [{
        step: 'primary-research',
        operator: 'custom',
        fn: (result) => !result.includes('billion') && !result.includes('million'),
      }],
    },
    {
      id: 'synthesize',
      type: 'aggregate',
      sourceSteps: ['primary-research', 'secondary-research'],
      format: 'summary',
      template: `
        Primary Source: {primary}
        Secondary Sources: {secondary}
        Estimated Range: {range}
      `,
    },
  ],
  config: {
    timeout: 300000,     // 5 min total
    maxRetries: 2,
    cache: true,
  },
});
```

### Appendix C: Testing Strategy

**Unit Tests:**
- Workflow definition validation
- Step executor logic (query, filter, aggregate)
- Condition evaluation
- Cache operations

**Integration Tests:**
- End-to-end workflow execution
- Agent integration (tool invocation)
- Error handling and retries
- Deduplication correctness

**Performance Tests:**
- Engine overhead measurement
- Cache hit rate under various loads
- Memory usage profiling
- Large workflow execution (50+ steps)

### Appendix D: Future Considerations

**Phase 2+ Features:**
1. **Parallel step execution** with cost optimization
2. **Workflow versioning** and rollback
3. **GraphRAG-based aggregation** for smarter synthesis
4. **Custom step types** (allow user-defined step executors)
5. **Workflow marketplace** (community-shared templates)
6. **Visual designer** (drag-drop UI for workflow creation)
7. **A/B testing** (compare workflow variants)
8. **Cost prediction** (estimate tokens before execution)

---

**Document Version**: 1.0
**Last Updated**: 2026-03-15
**Next Review**: 2026-04-15
