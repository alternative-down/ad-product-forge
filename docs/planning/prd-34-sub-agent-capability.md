# PRD-34: Sub-Agent Capability

**Status:** Exploratory
**Date:** 2026-03-15
**Version:** 1.0

---

## Personal Project Note

This is a personal development project. Features follow KISS (Keep It Simple, Stupid) and YAGNI (You Aren't Gonna Need It) principles. Scope focuses on core functionality for a solo developer workflow.

---

## 1. Overview

**Goal:** Allow agents to delegate simple tasks to cheaper sub-agents (Haiku) for cost reduction.

**Why:** Optimize cost by using cheaper models for simple tasks while keeping primary agent (Opus) for complex reasoning.

**Priority:** Low (optional exploration)
**Status:** Requires feasibility evaluation before implementation

---

## 2. Problem

- All tasks run on expensive Opus model regardless of complexity
- Simple tasks (data gathering, formatting) waste expensive token budget
- Parallelizable work executes sequentially
- No cost-awareness in agent workflows

---

## 3. Key Concept

**Sub-Agent:** Temporary agent spawned by primary agent for simple tasks.

- **Lifecycle:** Created on-demand, runs task, terminates
- **Model:** Haiku (3-5x cheaper than Opus)
- **Scope:** Single, simple task
- **Communication:** Synchronous request-response

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
| **Purpose** | Cost-optimize simple tasks | Security isolation for external interaction |
| **Model Tier** | Haiku (cheap) | Opus (quality-focused) |
| **Lifecycle** | Short-lived, task-scoped | Long-lived, conversational |
| **Failure Mode** | Degrade gracefully | May terminate task |

---

## 6. Requirements

### Core Features

**FR1: Sub-Agent Creation**
- Tool: `spawnSubAgent(taskName, taskDescription, taskInput, options)`
- Input validation and task specification
- Create temporary Haiku agent with task-specific prompt

**FR2: Execution & Results**
- Execute task synchronously
- Return: status, result, tokens used, execution time
- Handle timeout and errors gracefully

**FR3: Error Handling**
- Timeout protection (default: 30 seconds)
- Retry logic for transient failures
- Graceful degradation if sub-agent fails

### Agent-Facing Tool

```typescript
spawnSubAgent({
  taskName: string;
  taskDescription: string;
  taskInput: Record<string, unknown>;
  maxTokens?: number;
  timeoutSeconds?: number;
}): Promise<{
  status: "success" | "failed" | "timeout";
  result?: unknown;
  error?: string;
  tokensUsed: number;
  executionTimeMs: number;
}>
```

---

## 7. Success Criteria

- Sub-agents created and executed successfully
- Cost per task reduced when using sub-agents
- Sub-agent failure doesn't crash primary agent
- Clear documentation on when to use sub-agents vs. primary agent

---

## 8. Non-Functional Requirements

**Performance:**
- Sub-agent creation: reasonable latency
- Task execution: reliable

**Reliability:**
- Failed sub-agents return clear error
- Primary agent continues on sub-agent failure

**Cost:**
- Haiku usage: 3-5x cheaper than Opus

---

## 9. Configuration

### Environment Variables

```bash
SUB_AGENT_MODEL=claude-haiku
SUB_AGENT_TIMEOUT_SECONDS=30
SUB_AGENT_MAX_TOKENS=1000
```

---

## 10. Scope

### In Scope (if approved)
- Sub-agent creation and execution
- Synchronous execution model
- Error handling and retry logic
- Clear documentation distinguishing from external agents

### Out of Scope
- Batch/parallel execution
- Nested sub-agents (sub-agents spawning sub-agents)
- Distributed execution
- Advanced task decomposition
- Sub-agent result caching
- Cost tracking and analytics

---

## 11. Implementation Plan

### Phase 0: Feasibility Prototype (1 week) [REQUIRED BEFORE GO/NO-GO]

- [ ] Build minimal proof-of-concept (spawn one Haiku sub-agent from Opus)
- [ ] Measure actual token usage and cost savings
- [ ] Test sub-agent creation latency
- [ ] Document findings and recommend go/no-go

### Phase 1: Core Implementation (if approved, 1-2 weeks)
1. Create sub-agent type definitions
2. Implement `spawnSubAgent()` tool
3. Integrate with agent lifecycle
4. Error handling and logging
5. Basic testing

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

## 12. Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Quality degradation | Medium | Task specification guidelines |
| Confusion with external agents | High | Clear documentation |
| Latency overhead | Medium | Prototype testing |
| Feasibility blocker | High | Early prototype validation |

---

## 13. Example Workflow

```typescript
const primaryAgent = await createAgent({
  id: 'analyst-001',
  instructions: 'Analyze documents',
  model: 'claude-opus',
});

const document = doc1;

// Spawn sub-agent for simple task
const result = await primaryAgent.tool('spawnSubAgent', {
  taskName: 'Analyze Document',
  taskDescription: 'Extract key themes',
  taskInput: { document: document },
  maxTokens: 500
});

// Cost: ~$0.01 (vs. ~$0.05 with Opus)
```

---

## 14. Glossary

| Term | Definition |
|------|-----------|
| Sub-Agent | Temporary Haiku agent for simple tasks |
| Primary Agent | Opus agent that spawns sub-agents |
| Task Specification | Clear description of what sub-agent must do |

---

**Status:** Awaiting feasibility assessment decision
**Next Review:** Upon completion of feasibility phase
