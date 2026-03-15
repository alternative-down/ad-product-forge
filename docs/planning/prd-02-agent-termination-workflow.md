# Agent Termination Workflow

> **Note:** This is a personal project for a solo developer using LLM agents. Simplified for ease and practicality (KISS + YAGNI). Enterprise compliance and multi-user audit requirements are out of scope.

## 1. Executive Summary

### Classification: MASTRA FRAMEWORK

**This PRD describes core agent lifecycle management for the Mastra framework.** Clean agent removal is a fundamental requirement for any sophisticated multi-agent system. This is framework-level infrastructure that complements agent hiring (PRD-05) and enables safe agent management in any Mastra deployment.

The Agent Termination Workflow provides a safe mechanism for removing agents from the system. This ensures that when an agent is no longer needed, associated resources are cleaned up and data is preserved.

**Key objectives (Framework):**
- Provide a standardized workflow for agent removal across all Mastra deployments
- Manage cleanup of agent resources (memory, communication, databases) reliably
- Prevent orphaned references and stale data
- Support soft-termination (deactivation) and hard-termination (deletion)

**Key objectives (ad-product-forge):**
- Enable Nicolas to safely remove specialist agents after tasks complete
- Clean up resources when temporary research or development agents finish
- Maintain system health with proper agent lifecycle management

---

## 2. Problem Statement

Currently, there is no formal mechanism for terminating agents. This creates practical issues:

- **Orphaned resources:** Agent databases and memory may persist indefinitely
- **Data loss risk:** Unplanned removal could lose agent state

This makes it difficult to cleanly remove agents without side effects.

---

## 3. Goals & Success Criteria

### Primary Goals

1. **Clean Removal:** Safely remove agents with minimal data loss
2. **Resource Cleanup:** Delete agent databases, memory, and temporary files
3. **Simple Deletion:** Remove agent from registry with confirmation

### Success Criteria

- [ ] Agents can be deleted via CLI with confirmation
- [ ] Agent resources (databases, files) are identified and removed
- [ ] Confirmation message shows what was deleted
- [ ] Workflow available via CLI

---

## 4. User Stories & Use Cases

### Use Case 1: Delete an Agent

**Actor:** Developer

**Scenario:** An agent is no longer needed and should be removed completely.

**Flow:**
1. Developer runs: `forge agent delete agent-id`
2. System prompts for confirmation
3. Agent database and memory files are deleted
4. Agent removed from registry
5. System confirms deletion

**Acceptance Criteria:**
- Agent is removed
- All traces are gone (database, memory, files)
- Confirmation message shows what was deleted

---

## 5. Workflow States & Transitions

### Agent Lifecycle States

```
ACTIVE → DELETED
```

### State Definitions

| State | Description | Actions Allowed | Transitions |
|---|---|---|---|
| **ACTIVE** | Agent is running | All operations | → DELETED (with confirmation) |
| **DELETED** | Agent completely removed | None | (terminal) |

---

## 6. Resource Cleanup Strategy

### Resources to Clean Up

1. **Agent Database** (`{agentId}.db`)
2. **Agent Memory Store** (`.forge-memory/{agentId}/`)
3. **Registry Entries** (agent config, metadata)
4. **Temporary Files** (logs, cache files)

### Cleanup Timeline

**Deletion (on-demand):**
- Stop agent process
- Delete all agent databases
- Delete all memory files
- Delete registry entries
- Delete temporary files

---

## 7. Communication Provider Cleanup

### Provider Cleanup on Deletion

When an agent is deleted:

1. Disconnect from all communication providers (Discord, Email, etc.)
2. Delete stored credentials
3. Remove agent from provider records (if possible)

---

## 8. Data Preservation & Logging

### Simple Logging

On deletion, log the action:
- Agent ID deleted
- Timestamp of deletion
- Resources cleaned up
- Success/failure status

---

## 9. API & Implementation Contract

### Agent Termination Interface

Located in: `packages/mastra-engine/src/agent/termination/`

```typescript
interface AgentTerminationAPI {
  // Permanently delete agent (non-recoverable)
  delete(agentId: string, options?: {
    force?: boolean;  // skip confirmation
  }): Promise<TerminationResult>;

  // Get agent status
  getStatus(agentId: string): Promise<{
    state: 'ACTIVE' | 'DELETED';
  }>;
}
```

### Supporting Types

```typescript
interface TerminationResult {
  timestamp: Date;
  agentId: string;
  success: boolean;
  deletedResources: string[];
  error?: string;
}
```

---

## 10. CLI Commands

Located in: `packages/cli/src/commands/agent/terminate.ts`

```bash
# Delete agent (permanent removal)
forge agent delete <agentId> [--force]
```

### Example Usage

```bash
# Delete an agent
$ forge agent delete my-agent
Resources to be deleted:
- Database: 150 MB
- Memory: 45 MB
Delete? (y/N): y

✓ Agent deleted permanently
```

---

## 11. Integration Points

### Integration with Agent Registry

The agent registry must:
- Mark agent as DELETED
- Remove from active agents list

### Integration with Communication Module

The communication module must:
- Stop accepting inbound messages for the agent
- Disconnect from external providers
- Clean up provider credentials

### Integration with Storage

Storage layer must:
- Close database connections gracefully
- Delete agent database files
- Delete memory store files

---

## 12. Error Handling

### Failure Scenarios

| Scenario | Action | Recovery |
|---|---|---|
| **Backup creation fails** | Log error, fail operation | Retry backup before proceeding |
| **Provider disconnection fails** | Log error, continue | Manual cleanup required |
| **Database deletion fails** | Stop, alert user | Retry deletion |

### Recovery

- If deactivation fails: retry operation
- If deletion fails: retry operation
- If backup restore fails: manual recovery needed

---

## 13. Success Metrics

### Key Performance Indicators

| Metric | Target |
|---|---|
| **Deletion time** | < 30 seconds |
| **Resource cleanup success rate** | 100% |

---

## Future Enhancements

1. Batch deletion of multiple agents (if needed)
