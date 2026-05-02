# Agents

## Concept

An agent in Forge is an autonomous entity that:
- Persists in database
- Has its own runtime (LLM config + tools)
- Communicates via configured providers
- Executes in loops with `nextStep`
- Maintains long-term memory with checkpointing

## Lifecycle

```
Hiring → Active → (paused) → Terminated
```

### Hiring

Admission process for a new agent:

1. Create record in `agents`
2. Create role in `agent_roles`
3. Define tool and workflow permissions
4. Create initial contract in `agent_execution_contracts`
5. Populate initial workspace
6. Add to registry

Files: `hire-agent.ts`, `hiring-profile.ts`, `hiring-rh.ts`

### Active

Agent in normal execution:

- Scheduler triggers `nextStep` periodically
- AgentRunner executes generate via LLM
- Tools executed if needed
- LTM checkpointed after state changes

Files: `agent-runner.ts`, `agent-runner-scheduler.ts`, `agent-runtime-platform.ts`

### Termination

Agent exit process:

1. Stop scheduler
2. Dispose runtime
3. Remove from registry
4. Update status to `terminated`
5. Keep history in database

File: `terminate-agent.ts`

## Runtime

### AgentRunner

Orchestrates agent execution.

```typescript
const runner = new AgentRunner(runtime, store, options);
await runner.beginRun();
await runner.nextStep(options);
await runner.endRun();
```

### AgentRuntime

Concrete runtime that executes prompts.

```typescript
const runtime = await createAgentRuntime({
  agentId,
  llmProfile,
  capabilities,
  communicationProviders,
  tools,
});
```

### Scheduler

Triggers `nextStep` based on schedules.

```typescript
const scheduler = createAgentScheduleManager(db, registry);
scheduler.schedule(agentId, nextStepAt);
```

Types:
- `cron` — cron expression (e.g., `0 * * * *`)
- `interval` — interval in ms
- `oneshot` — single execution

## Memory

### Working Memory

Short-term memory during execution.

```typescript
interface RuntimeWorkingMemory {
  messages: Array<RuntimeMessage>;
  observations: Array<Observation>;
  reflections: Array<Reflection>;
}
```

### Long-Term Memory (LTM)

Long-term memory with checkpointing.

```typescript
interface AgentCheckpointedOmState {
  checkpointedOmTotalContextTokens: number;
  checkpointedOmRecentRawTokens: number;
  stateJson: string; // Serialized operational memory
}
```

Files: `agent-long-term-memory.ts`, `agent-long-term-memory-recall.ts`, `agent-long-term-memory-store.ts`

## Skills

### Workspace Skills

Skills installed in agent workspace.

```typescript
const skills = await loadWorkspaceSkills(workspacePath);
```

Format: ZIP with skill structure.

### Global Skills

Shared skills available to all agents.

```typescript
import { globalSkills } from './global-skills';
```

Bundled skills in code.

## Tool Permissions

Each role defines which tools the agent can use.

```typescript
interface RoleToolPermission {
  roleId: string;
  toolId: string; // e.g., 'github.create-issue', 'discord.send-message'
}
```

Verified at runtime before tool execution.
