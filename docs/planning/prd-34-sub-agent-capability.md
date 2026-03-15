# PRD-34: Sub-Agent Capability

**Status:** Exploratory
**Date:** 2026-03-15
**Version:** 1.0

---

## Personal Project Note

This is a personal development project. Features follow KISS (Keep It Simple, Stupid) and YAGNI (You Aren't Gonna Need It) principles. Scope focuses on core functionality for a solo developer workflow.

---

## 1. Overview

**Goal:** Allow agents to delegate tasks to cheaper sub-agents for cost optimization.

**Why:** Complex reasoning and simple data gathering both use expensive models. Delegate simple tasks to cheaper models (Haiku) to reduce costs while keeping primary agent (Opus) for complex reasoning.

**Priority:** Low (exploratory phase)
**Status:** Requires feasibility evaluation before implementation

---

## 2. Problem

- All tasks run on expensive Opus model regardless of complexity
- Simple tasks (data gathering, formatting) waste expensive token budget
- Parallelizable work executes sequentially
- No cost-awareness in agent workflows

---

## 3. Key Concept

**Sub-Agent:** Temporary, lightweight agent spawned by primary agent for a specific task.

- **Lifecycle:** Created on-demand, runs task, terminates
- **Model:** Haiku or Sonnet (3-5x cheaper than Opus)
- **Scope:** Single, well-defined task
- **Communication:** Synchronous request-response
- **Isolation:** Lightweight (can share some resources)

---

## 4. Use Cases

1. **Batch Document Analysis:** Primary agent spawns 10 Haiku sub-agents to analyze 10 documents in parallel, then synthesizes results
2. **Data Gathering:** Primary agent spawns 3 sub-agents to fetch data from different sources simultaneously
3. **Content Preprocessing:** Sub-agents clean and normalize input data before primary agent analyzes

---

## 5. Sub-Agent vs. External Agent

**Critical Distinction:**

| Aspect | Sub-Agents | External Agents |
|--------|-----------|-----------------|
| **Purpose** | Cost-optimize internal tasks | Security isolation for external consultation |
| **Model Tier** | Haiku/Sonnet (cheap) | Same as primary (quality-focused) |
| **Context Access** | Can access task context | No access to internal data |
| **Communication** | Direct, synchronous | Asynchronous, message-based |
| **Lifecycle** | Short-lived, task-scoped | Long-lived, conversational |
| **Failure Mode** | Degrade gracefully, retry | May terminate task |

---

## 6. Requirements

### Core Features

**FR1: Sub-Agent Creation**
- Tool: `spawnSubAgent(taskName, taskDescription, taskInput, modelTier, options)`
- Input validation and task specification
- Create temporary agent with task-specific prompt
- Execute on specified model tier (Haiku/Sonnet)

**FR2: Execution & Results**
- Execute task synchronously (primary agent blocks on result)
- Validate result against expected format
- Return: status, result, tokens used, cost estimate, execution time
- Handle timeout and errors gracefully

**FR3: Cost Tracking**
- Track tokens used per sub-agent task
- Calculate cost based on model tier
- Display cost savings vs. primary agent
- Accumulate total savings

**FR4: Error Handling**
- Timeout protection (default: 30 seconds)
- Invalid result validation
- Retry logic for transient failures
- Fallback to alternative model if needed
- Graceful degradation if sub-agent fails

**FR5: Batch Sub-Agents** (optional, Phase 2)
- `spawnSubAgentBatch(tasks, parallelism)` to spawn multiple sub-agents
- Execute in parallel with concurrency limits
- Collect all results before returning

### Agent-Facing Tool

```typescript
spawnSubAgent({
  taskName: string;
  taskDescription: string;
  taskInput: Record<string, unknown>;
  modelTier: "haiku" | "sonnet";
  maxTokens?: number;
  timeoutSeconds?: number;
  expectedOutputFormat?: string;
}): Promise<{
  subAgentId: string;
  status: "success" | "failed" | "timeout";
  result?: unknown;
  error?: string;
  tokensUsed: number;
  costEstimate: number;
  executionTimeMs: number;
}>
```

---

## 7. Success Criteria

- Sub-agents created and terminated with <500ms latency
- Parallel execution reduces workflow time by ≥30%
- Cost per task reduced by ≥60% when using sub-agents
- Sub-agent failure doesn't crash primary agent
- Documentation clearly distinguishes sub-agents from external agents

---

## 8. Non-Functional Requirements

**Performance:**
- Sub-agent creation: <500ms
- Task execution overhead: minimal
- Parallel spawning: support 10+ concurrent sub-agents

**Reliability:**
- Failed sub-agents return clear error
- Retry logic for transient failures
- Primary agent continues on sub-agent failure

**Cost:**
- Haiku usage: 3-5x cheaper than Opus
- Sonnet usage: 2-3x cheaper than Opus
- Cost calculation accurate and logged

---

## 9. Configuration

### Environment Variables

```bash
SUB_AGENT_DEFAULT_MODEL=claude-haiku
SUB_AGENT_TIMEOUT_SECONDS=30
SUB_AGENT_MAX_TOKENS=1000
SUB_AGENT_ENABLE_COST_TRACKING=true
SUB_AGENT_MAX_PARALLEL_SPAWNS=50
```

---

## 10. Scope

### In Scope (if approved)
- Sub-agent creation and execution
- Cost tracking per task
- Synchronous execution model
- Error handling and retry logic
- Differentiation documentation from external agents

### Out of Scope
- Batch/parallel execution (Phase 2)
- Sub-agents spawning sub-agents (nested)
- Distributed sub-agent execution
- Advanced task decomposition algorithms
- Sub-agent result caching

---

## 11. Implementation Plan

### Phase 0: Feasibility (Week 1-2) [REQUIRED BEFORE GO/NO-GO]

- [ ] **Prototype:** Build minimal proof-of-concept (spawn one Haiku sub-agent from Opus)
- [ ] **Cost Analysis:** Measure actual token usage and cost savings
- [ ] **Latency Testing:** Measure sub-agent creation and execution overhead
- [ ] **Architecture Decision:** Determine creation mechanism and communication protocol
- [ ] **Feasibility Report:** Document findings and recommend go/no-go

### Phase 1: Core Implementation (if approved, Week 3-4)
1. Create sub-agent type definitions
2. Implement `spawnSubAgent()` tool
3. Integrate with agent lifecycle
4. Implement cost tracking
5. Unit tests

### Phase 2: Advanced Features (Week 5-6, optional)
1. Batch execution support
2. Async/promise-based communication
3. Nested sub-agents
4. Integration tests

---

## 12. Data Flow

### Execution Flow

```
Primary Agent (Opus)
  │
  ├─ Receives task: "Analyze 3 documents"
  │
  ├─ spawnSubAgent({
  │    taskName: "Analyze Document 1",
  │    taskInput: { doc: "..." },
  │    modelTier: "haiku"
  │  })
  │    ├─ Create Haiku sub-agent instance
  │    ├─ Inject task context + system prompt
  │    ├─ Execute task (process document)
  │    ├─ Validate result format
  │    └─ Return: { status: "success", result: {...}, costEstimate: "$0.02" }
  │
  └─ Repeat for documents 2 and 3
     └─ Aggregate results
        ├─ Synthesize findings
        ├─ Log total cost: ~$0.06 (vs. ~$0.30 if done by Opus)
        └─ Return to requester
```

---

## 13. Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Quality degradation | Medium | Task decomposition guidelines, validation |
| Confusion with external agents | High | Clear documentation, decision matrix |
| Uncontrolled spawning | Medium | Max parallelism limits, cost budgets |
| Latency overhead | Medium | Prototype testing, benchmarking |
| Feasibility blocker | High | Early prototype validation |

---

## 14. Example Workflow

```typescript
const primaryAgent = await createAgent({
  id: 'analyst-001',
  instructions: 'Analyze documents',
  model: 'claude-opus',
});

const documents = [doc1, doc2, doc3];

// Spawn sub-agents for parallel processing
const results = [];
for (const doc of documents) {
  const result = await primaryAgent.tool('spawnSubAgent', {
    taskName: `Analyze Document`,
    taskDescription: 'Extract key themes and sentiment',
    taskInput: { document: doc },
    modelTier: 'haiku',
    maxTokens: 500
  });
  results.push(result);
}

// Synthesize
const synthesis = await primaryAgent.synthesize(results);

// Cost: ~$0.05 (vs. ~$0.15 with Opus only)
```

---

## 15. Open Questions

**Technical Decisions Needed:**
1. In-process vs. separate instance sub-agents?
2. Synchronous (blocking) or asynchronous (promises)?
3. Should sub-agents access primary agent's memory?
4. Fixed model tier (Haiku) or flexible (Haiku/Sonnet/Opus)?

**Feasibility Questions:**
1. Can token counts be tracked accurately?
2. What is sub-agent creation overhead?
3. Is Haiku quality acceptable for typical tasks?
4. How much integration work is required?

---

## 16. Decision Checklist

Before proceeding to Phase 1, these decisions must be made:

- [ ] GO/NO-GO decision on Sub-Agent capability
- [ ] Communication protocol: synchronous or asynchronous?
- [ ] Model tier strategy: fixed or flexible?
- [ ] Isolation level: lightweight or heavy?
- [ ] Storage: track executions in database?

---

## Glossary

| Term | Definition |
|------|-----------|
| Sub-Agent | Temporary agent spawned for specific task |
| Primary Agent | Orchestrating agent that spawns sub-agents |
| Task Decomposition | Breaking large task into sub-agent-sized chunks |
| Model Tier | Price/capability level (Haiku, Sonnet, Opus) |
| Cost Savings | Reduction in token spend vs. primary agent |

---

**Status:** Awaiting feasibility assessment decision
**Decision Required By:** End of Week 2
**Next Review:** Upon completion of feasibility phase
