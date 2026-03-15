# Agent Termination Workflow

> **Note:** This is a personal project for a solo developer using LLM agents. Simplified for ease and practicality (KISS + YAGNI). Enterprise compliance and multi-user audit requirements are out of scope.

## 1. Executive Summary

The Agent Termination Workflow provides a safe mechanism for removing agents from the system. This ensures that when an agent is no longer needed, associated resources are cleaned up and data is preserved.

**Key objectives:**
- Provide a standardized workflow for agent removal
- Manage cleanup of agent resources (memory, communication, databases)
- Prevent orphaned references and stale data
- Support soft-termination (deactivation) and hard-termination (deletion)

---

## 2. Problem Statement

Currently, there is no formal mechanism for terminating agents. This creates practical issues:

- **Orphaned resources:** Agent databases and memory may persist indefinitely
- **Dangling references:** Other agents may reference terminated agents
- **Data loss risk:** Unplanned removal could lose agent state

This makes it difficult to cleanly remove agents without side effects.

---

## 3. Goals & Success Criteria

### Primary Goals

1. **Clean Removal:** Safely remove agents with minimal data loss
2. **Resource Cleanup:** Delete agent databases, memory, and temporary files
3. **Optional Backup:** Create backups before deletion for recovery (30-day window)
4. **Basic Logging:** Track termination events for debugging

### Success Criteria

- [ ] Agents can be deactivated or deleted
- [ ] Termination is logged with timestamp and reason
- [ ] Agent resources (databases, files) are identified and removed
- [ ] Backup created before deletion (optional restore within 30 days)
- [ ] Workflow available via CLI or API

---

## 4. User Stories & Use Cases

### Use Case 1: Delete an Agent

**Actor:** Developer

**Scenario:** An agent is no longer needed and should be removed.

**Flow:**
1. Developer runs: `forge agent delete agent-id`
2. System prompts for confirmation
3. Agent database and memory files are deleted
4. Agent removed from registry
5. System confirms deletion

**Acceptance Criteria:**
- Agent is removed
- All traces are gone
- Confirmation message shows what was deleted

### Use Case 2: Deactivate an Agent (with Backup)

**Actor:** Developer

**Scenario:** An agent needs to be stopped but data should be preserved for potential recovery.

**Flow:**
1. Developer runs: `forge agent deactivate agent-id`
2. System creates backup
3. Agent stopped
4. Backup stored for 30 days
5. Confirmation message shown

**Acceptance Criteria:**
- Agent is deactivated
- Backup created successfully
- Can be restored within 30 days

---

## 5. Workflow States & Transitions

### Agent Lifecycle States

```
ACTIVE → INACTIVE → DELETED
   ↓        ↓         ↓
   └─ BACKUP (optional, 30 day recovery window)
```

### State Definitions

| State | Description | Duration | Actions Allowed | Transitions |
|---|---|---|---|---|
| **ACTIVE** | Agent is running | N/A | All operations | → INACTIVE |
| **INACTIVE** | Agent stopped, backup preserved | 30 days | None | → DELETED or restore to ACTIVE |
| **DELETED** | Agent completely removed | N/A | None | (terminal) |

### State Transition Rules

- **ACTIVE → INACTIVE:** Initiated via `agent deactivate`, creates backup
- **INACTIVE → DELETED:** Manual via `agent delete`
- **INACTIVE → ACTIVE:** Restore from backup (within 30 days)

---

## 6. Resource Cleanup Strategy

### Resources to Clean Up

1. **Agent Database** (`{agentId}.db`)
2. **Agent Memory Store** (`.forge-memory/{agentId}/`)
3. **Communication Resources** (provider accounts, contacts, histories)
4. **Registry Entries** (agent config, metadata)
5. **Temporary Files** (logs, cache, lock files)

### Cleanup Timeline

**Deactivation (immediate):**
- Stop agent process
- Disconnect from external providers
- Create backup (stored 30 days)

**Deletion (on-demand):**
- Delete all agent databases
- Delete all memory files
- Delete registry entries
- Delete temporary files
- Backup retained for potential recovery

---

## 7. Communication Provider Cleanup

### Provider Cleanup on Deactivation

When an agent is deactivated:

1. Disconnect from all communication providers (Discord, Email, etc.)
2. Store credentials in backup (for potential restore)
3. Stop listening for inbound messages

### Provider Cleanup on Deletion

When an agent is deleted:

1. Revoke credentials if possible
2. Delete stored credentials
3. Remove agent from provider records

---

## 8. Data Preservation & Logging

### Termination Log

Every termination action is logged:

```json
{
  "timestamp": "2025-03-15T10:30:00Z",
  "agentId": "agent-id",
  "action": "deactivate|delete|restore",
  "reason": "optional reason",
  "status": "success|failed",
  "backupCreated": true,
  "backupLocation": "path/to/backup",
  "details": {}
}
```

### Backup Strategy

**Before Deactivation:**
1. Full backup created:
   - Agent database
   - Memory files
   - Communication history
   - Configuration

2. Backup stored for 30 days for recovery

**Recovery:**
- INACTIVE agents can be restored within 30 days
- DELETED agents cannot be recovered

---

## 9. API & Implementation Contract

### Agent Termination Interface

Located in: `packages/mastra-engine/src/agent/termination/`

```typescript
interface AgentTerminationAPI {
  // Deactivate agent (stop process, create backup)
  deactivate(agentId: string, options?: {
    reason?: string;
    createBackup?: boolean;  // default true
  }): Promise<TerminationEvent>;

  // Permanently delete agent (non-recoverable)
  delete(agentId: string, options?: {
    force?: boolean;  // skip confirmation
  }): Promise<TerminationEvent>;

  // Restore agent from backup
  restore(agentId: string, backupPath?: string): Promise<Agent>;

  // Get termination status
  getTerminationStatus(agentId: string): Promise<{
    state: AgentState;
    backupAvailable: boolean;
    backupExpiresAt?: Date;
  }>;
}
```

### Supporting Types

```typescript
type AgentState = 'ACTIVE' | 'INACTIVE' | 'DELETED';

interface TerminationEvent {
  timestamp: Date;
  agentId: string;
  action: 'deactivate' | 'delete' | 'restore';
  reason?: string;
  status: 'success' | 'failed';
  newState: AgentState;
  backupCreated?: boolean;
  backupLocation?: string;
  error?: string;
}
```

---

## 10. CLI Commands

Located in: `packages/cli/src/commands/agent/terminate.ts`

```bash
# Deactivate agent (stop process, create backup)
forge agent deactivate <agentId> [--reason <string>]

# Delete agent (permanent removal)
forge agent delete <agentId> [--force]

# Restore agent from backup
forge agent restore <agentId> [--backup-path <path>]

# Show termination status
forge agent status <agentId>
```

### Example Usage

```bash
# Deactivate an agent
$ forge agent deactivate my-agent --reason "End of life"
✓ Agent deactivated
✓ Backup created: ./backups/my-agent/2025-03-15.tar.gz
✓ Data preserved for 30 days

# Delete an agent
$ forge agent delete my-agent
Resources to be deleted:
- Database: 150 MB
- Memory: 45 MB
Delete? (y/N): y

✓ Agent deleted permanently

# Restore from backup
$ forge agent restore my-agent --backup-path ./backups/my-agent/2025-03-15.tar.gz
✓ Agent restored from backup
```

---

## 11. Integration Points

### Integration with Agent Registry

The agent registry must track:
- Current agent state (ACTIVE, INACTIVE, DELETED)
- Backup information
- Termination timestamp

**Registry Updates:**
- `setAgentState(agentId, state)` — update agent state
- `getAgentState(agentId)` — query current state
- `recordTerminationEvent(event)` — log termination action

### Integration with Communication Module

The communication module must:
- Implement `onTerminate()` hook
- Stop accepting inbound messages
- Disconnect from providers
- Preserve conversation history

### Integration with Memory System

Memory components must:
- Close database connections gracefully
- Flush pending operations
- Include memory files in backup

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
| **Deactivation time** | < 30 seconds |
| **Deletion time** | < 1 minute |
| **Backup creation success rate** | > 99% |
| **Backup restore time** | < 5 minutes |

---

## Future Enhancements

1. Batch termination of multiple agents
2. Scheduled termination for future date/time
3. Analytics export before termination
4. Advanced retention policies
