# PRD-11: Research as Workflow

**Status:** Draft — Specification Phase

**Date:** 2026-03-15

**Note:** This is a personal project from a solo developer. Built with KISS (Keep It Simple, Stupid) and YAGNI (You Aren't Gonna Need It) principles in mind.

**Related Features:**
- Agent Execution Model (workflow orchestration)
- External Webhooks (trigger research flows)

---

## 1. Executive Summary

Enable multi-step research workflows: chain queries together, branch on results, and aggregate findings. Builds on existing research tool.

**Core Value:**
- Chain multiple research queries
- Branch workflows conditionally
- Combine results from multiple searches
- Simple API, backward compatible

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
- **Chainable research** — Execute multiple queries in sequence
- **Conditional branching** — Skip steps based on results
- **Simple composition** — Reuse workflows in agent prompts

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

### 3.2 Success Criteria

- Workflows defined in code execute correctly
- Sequential steps complete in order
- Conditional branching works as expected
- Results aggregate without duplication

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

**Out of Scope:**
- Parallel step execution
- Workflow UI designer
- Advanced ranking algorithms
- Real-time streaming
- Versioning and rollback
- Persistent workflow storage
- Audit logging
- Cost tracking

### 4.3 Key Definitions

| Term | Definition |
| --- | --- |
| **Research Workflow** | Deterministic, DAG-based sequence of research steps with conditional branching |
| **Research Step** | Single unit of research: query, filter, aggregate, or custom logic |
| **Research Result** | Structured output from a step (document list, insights, formatted text) |
| **Result Cache** | Per-workflow deduplication to avoid redundant queries |
| **Step State** | pending, in-progress, completed, failed, skipped |

---

## 5. Use Cases

### 5.1 Competitor Analysis
Chain queries: list competitors → get features/pricing → aggregate comparison.

### 5.2 Market Sizing
Query primary estimates → if low confidence, query secondary sources → aggregate results.

### 5.3 Multi-Step Research
Sequential searches with conditional branching based on intermediate results.

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
  status: 'completed' | 'failed';
  steps: Map<string, StepResult>;      // All step results
  finalResult: any;                    // Output of last step
  duration: number;                    // Total execution time
};

// Runtime configuration
type WorkflowConfig = {
  timeout?: number;                    // Total workflow time budget (ms)
  maxRetries?: number;                 // Default retries per step
};
```

### 6.3 Core Features

1. **Workflow Definition** — Define workflows in TypeScript with typed steps
2. **Sequential Execution** — Steps execute in order
3. **Conditional Branching** — Skip steps based on previous results
4. **Result Aggregation** — Combine results into final output
5. **Error Handling** — Retry failed steps
6. **Timeouts** — Prevent runaway workflows

---

## 7. Implementation

### 7.1 File Structure

```
packages/mastra-engine/src/workflows/research/
├─ definition.ts       — Define and validate workflows
├─ engine.ts           — Execute workflows
├─ steps.ts            — Step executors (query, filter, aggregate)
├─ cache.ts            — Result deduplication
└─ types.ts            — TypeScript types
```

### 7.2 Key Classes

- **ResearchWorkflow** — Workflow definition
- **WorkflowEngine** — Executes workflows
- **StepExecutor** — Handles individual step logic
- **ResultCache** — In-memory dedup cache

### 7.2 Execution Flow

Simple sequential execution:
1. Validate workflow definition
2. For each step in order:
   - Check if conditions pass
   - Skip if condition fails
   - Execute step (query research, filter, or aggregate)
   - Handle errors with retries
3. Return final aggregated result

---

## 8. API Examples

```typescript
// Execute a workflow
const result = await executeResearchWorkflow(marketSizingWorkflow, {
  market: 'SaaS',
});

// Access results
console.log(result.finalResult);  // Aggregated output
console.log(result.duration);     // Execution time
```

---

## 9. Timeline

- **Week 1-2**: Implement workflow definition and engine
- **Week 2-3**: Add step executors (query, filter, aggregate) and caching
- **Week 3-4**: Integrate with agent, add tests and documentation

---

**Document Version:** 0.1 (Simplified)
**Last Updated:** 2026-03-15
