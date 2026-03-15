# Agent Termination Workflow

## 1. Executive Summary

The Agent Termination Workflow provides a graceful and safe mechanism for removing agents from the ad-product-forge system. This feature ensures that when an agent is no longer needed, all associated resources are properly cleaned up, state is preserved for audit trails, and dependencies are managed to prevent orphaned data or dangling references.

**Key objectives:**
- Provide a standardized workflow for agent deactivation and removal
- Manage cleanup of resources tied to agent lifecycle (memory, communication, tools, databases)
- Ensure data preservation for audit and compliance
- Prevent cascading failures from orphaned agent references
- Support both soft-termination (deactivation) and hard-termination (deletion)

---

## 2. Problem Statement

Currently, there is no formal mechanism for terminating agents in the system. This creates several risks:

- **Orphaned resources:** Agent databases, memory stores, and communication channels may persist indefinitely
- **Dangling references:** Other agents, workflows, or systems may reference terminated agents without knowing they're gone
- **Compliance issues:** No audit trail for agent lifecycle events
- **Resource waste:** Inactive agents continue consuming storage and potentially compute resources
- **Data loss risk:** Unplanned removal could lose important agent state, memories, or conversation history

The lack of a structured termination workflow makes it difficult to:
1. Safely remove agents without side effects
2. Audit when and why agents were removed
3. Preserve agent state for legal or compliance requirements
4. Manage dependencies between agents

---

## 3. Goals & Success Criteria

### Primary Goals

1. **Graceful Termination:** Implement a multi-stage workflow that safely removes agents with zero data loss (unless explicitly deleted)
2. **Resource Cleanup:** Automatically manage cleanup of agent-specific databases, indexes, communication accounts, and temporary files
3. **Audit Trail:** Create comprehensive logging of all termination events for compliance and debugging
4. **Dependency Management:** Identify and handle references to terminated agents across the system
5. **Data Preservation:** Maintain agent state in archive form for recovery or legal holds

### Success Criteria

- [ ] Agents can be deactivated without losing their communication history or memory
- [ ] Agent termination is tracked in system logs with timestamp, reason, and actor
- [ ] All agent resources (databases, files, indexes) are identified and cleaned up within a defined schedule
- [ ] Dependent agents or systems are notified when an agent is terminated
- [ ] Archived agent data can be restored within a defined recovery window (e.g., 30 days)
- [ ] Hard deletion removes all trace of an agent (GDPR right to be forgotten compliance)
- [ ] Termination workflow can be automated via CLI, API, or UI
- [ ] Performance impact on running agents is negligible

---

## 4. User Stories & Use Cases

### Use Case 1: Deactivate a Chatbot Agent

**Actor:** System Administrator

**Scenario:** A customer service chatbot is being replaced by a newer version. The old bot should stop processing new messages but its conversation history must be preserved for customer support reference.

**Flow:**
1. Admin initiates agent deactivation via CLI: `forge agent deactivate chatbot-v1`
2. System marks agent as INACTIVE in the registry
3. Communication providers are notified to stop routing messages to this agent
4. Existing conversations are archived but remain queryable
5. Agent memory and context are preserved in read-only storage
6. Admin can view deactivation status and archived data

**Acceptance Criteria:**
- Agent no longer receives external messages
- Historical conversations remain accessible
- Deactivation completes within 30 seconds
- No impact on other running agents

### Use Case 2: Delete a Failed Experimental Agent

**Actor:** Developer

**Scenario:** A developer creates an experimental agent for testing, but it fails to initialize properly. The agent needs to be completely removed to free up resources and avoid future confusion.

**Flow:**
1. Developer initiates hard deletion: `forge agent delete experimental-agent --force`
2. System prompts for confirmation (shows what will be deleted)
3. All agent resources are marked for deletion
4. Agent databases are wiped
5. Communication accounts are deregistered
6. Agent is removed from registry
7. System confirms deletion with details of cleanup

**Acceptance Criteria:**
- Agent and all traces are removed within 1 minute
- No references to agent remain in system
- Confirmation message shows what was deleted
- Cannot be recovered after deletion

### Use Case 3: Preserve Agent State for Compliance Hold

**Actor:** Compliance Officer

**Scenario:** An agent is suspected of handling sensitive data that may be relevant to a legal investigation. The agent must be terminated from active service but all state preserved for future analysis.

**Flow:**
1. Compliance officer initiates agent freeze: `forge agent freeze agent-id --reason "Legal hold"`
2. System transitions agent to FROZEN state
3. Agent is marked with legal hold metadata
4. All agent data is write-protected and archived
5. Data remains encrypted and stored for defined retention period
6. Access is logged for audit purposes

**Acceptance Criteria:**
- Agent cannot be modified or deleted while frozen
- Freeze reason and date are recorded
- Data remains accessible for authorized personnel
- System prevents accidental deletion

### Use Case 4: Cascade Termination

**Actor:** System Administrator

**Scenario:** A parent agent that manages multiple child agents is being removed. The system needs to handle cleanup of all dependent child agents.

**Flow:**
1. Admin initiates parent agent termination
2. System identifies all child agents dependent on the parent
3. User is prompted to confirm cascade deletion or migrate children
4. If confirmed, all dependent agents are deactivated
5. Audit log shows parent and all children were terminated together

**Acceptance Criteria:**
- Child agents are identified before deletion
- Admin is informed of cascading effects
- All agents in cascade are logged together
- No orphaned child agents remain

---

## 5. Workflow States & Transitions

### Agent Lifecycle States

```
ACTIVE → DRAINING → INACTIVE → ARCHIVED → DELETED
   ↓        ↓           ↓          ↓         ↓
   └─ FROZEN (legal hold)
       │
       └─ ACTIVE (release from hold)
```

### State Definitions

| State | Description | Duration | Actions Allowed | Transitions |
|---|---|---|---|---|
| **ACTIVE** | Agent is running and processing messages | N/A | All operations | → DRAINING, FROZEN |
| **DRAINING** | Agent still running but not accepting new messages | 1-24 hours | Read-only operations, manual trigger to INACTIVE | → INACTIVE, ACTIVE (cancel) |
| **INACTIVE** | Agent stopped, data preserved, archived | 30 days (configurable) | Archive access only | → ARCHIVED, ACTIVE (restore) |
| **FROZEN** | Legal hold applied, no modifications allowed | Indefinite | Audit access only | → ACTIVE (release), ARCHIVED (after legal hold expires) |
| **ARCHIVED** | Agent data compressed and moved to cold storage | 90-365 days (configurable) | Read access for compliance | → DELETED (after retention period) |
| **DELETED** | Agent completely removed, non-recoverable | N/A | None | (terminal) |

### State Transition Rules

- **ACTIVE → DRAINING:** Initiated by admin via `agent.drain()`, triggers notification to stop routing new messages
- **DRAINING → INACTIVE:** Automatic after drain period expires OR manual trigger via `agent.deactivate()`
- **INACTIVE → ARCHIVED:** Automatic after archive threshold (30 days default) OR manual via `agent.archive()`
- **ARCHIVED → DELETED:** Automatic after retention period expires OR manual via `agent.delete()`
- **ACTIVE ↔ FROZEN:** Manual transitions with legal hold metadata
- **FROZEN → ACTIVE:** Release from hold, return to ACTIVE state
- **FROZEN → ARCHIVED:** Only after legal hold expires
- **Any → ACTIVE:** Only via `agent.restore()` while backup exists (within recovery window)

---

## 6. Resource Cleanup Strategy

### Resources Owned by Agent

Each agent instance owns the following resources:

1. **Agent Database** (`{agentId}.db`)
   - Working memory messages
   - Observational memory records
   - Communication store tables
   - Embedded vector indexes
   - Tool execution logs

2. **Agent Memory Store**
   - Long-term memory observations (`.forge-memory/{agentId}/observations/`)
   - Indexed documents for semantic search
   - GraphRAG nodes and relationships
   - Temporary cache files

3. **Communication Resources**
   - Provider accounts (Discord, Email, etc.)
   - Contact list and relationships
   - Conversation history
   - Message attachments (if stored locally)

4. **Tool-Specific Resources**
   - Tool configuration and state
   - Tool-generated files or artifacts
   - Tool API credentials or tokens

5. **Registry Entries**
   - Agent configuration
   - Runtime metadata
   - Scheduling information (cron jobs, etc.)
   - Policy definitions

6. **Temporary Files**
   - Agent logs (stdout/stderr)
   - Cache directories
   - Lock files
   - Temporary uploads/downloads

### Cleanup Timeline

**Stage 1: Drain (1-24 hours)**
- Send termination notice to all communication providers
- Stop accepting new inbound messages
- Allow agent to finish processing in-flight work
- Begin preparing archive files

**Stage 2: Deactivate (immediate)**
- Stop agent process
- Disconnect from external providers
- Write final agent state checkpoint
- Mark all conversation as archived
- Disable all inbound routing

**Stage 3: Archive (30 days)**
- Compress agent database into archive format
- Move memory files to archive storage
- Compress communication history
- Encrypt archive with system key
- Remove original uncompressed data
- Keep archive in accessible storage

**Stage 4: Retain (90-365 days)**
- Move archive to cold storage if configured
- Maintain encryption
- Log all access attempts
- Keep metadata for compliance queries

**Stage 5: Delete (on expiry)**
- Securely wipe all archives
- Remove registry entries
- Clean up metadata
- Log final deletion
- Remove from backups after next rotation

### Cleanup Operations

**During INACTIVE:**
```
1. Stop agent process (if running)
2. Close all database connections
3. Flush communication buffers
4. Write final checkpoint to backup
5. Disconnect from providers (gracefully)
6. Release any acquired locks or leases
```

**During ARCHIVED:**
```
1. Compress agent database with zstd
2. Compress memory files into tar archive
3. Encrypt archive with system KMS key
4. Generate SHA256 checksums for integrity
5. Move to archive storage location
6. Delete original uncompressed files
7. Update metadata to point to archive
```

**During DELETED:**
```
1. Permanently delete all archives
2. Overwrite database files (shred)
3. Remove from system backups (if automated)
4. Remove agent from service discovery
5. Remove from monitoring/alerting
6. Clean up log files
7. Final audit log entry
```

---

## 7. Deactivation & Communication Provider Cleanup

### Provider Notification

When an agent transitions to DRAINING or INACTIVE:

1. Each registered communication provider is notified
2. Provider-specific cleanup happens:

**Discord Provider:**
- Unregister webhook endpoints
- Leave configured servers/guilds (optional, configurable)
- Archive integration tokens
- Log deactivation timestamp

**Email Provider:**
- Disconnect IMAP listener
- Disconnect SMTP session
- Archive email credentials
- No deletion of historical emails (preserved by provider)

**Internal Chat Provider:**
- Deregister agent from chat router
- Archive session tokens
- Mark agent as unavailable

**Custom Providers:**
- Call `provider.onTerminate()` if implemented
- Archive provider-specific credentials
- Log cleanup actions

### Provider Credential Management

All provider credentials are:
- Archived with the agent data
- Encrypted at rest
- Revoked (if possible) before deletion
- Never permanently deleted until agent is fully deleted

---

## 8. Data Preservation & Audit Trail

### Audit Log Schema

Every termination action is logged:

```json
{
  "timestamp": "2025-03-15T10:30:00Z",
  "agentId": "chatbot-v1",
  "action": "deactivate|drain|archive|delete|freeze|restore",
  "actor": "admin@company.com",
  "reason": "Replaced by v2",
  "resourcesAffected": {
    "databaseSize": "2.3 GB",
    "messageCount": 15847,
    "conversationCount": 342,
    "providersRegistered": ["discord", "email"],
    "childAgents": []
  },
  "status": "success|failed",
  "details": { ... },
  "metadata": {
    "legalHold": false,
    "backupGenerated": true,
    "backupLocation": "s3://backups/agents/chatbot-v1/2025-03-15.tar.gz"
  }
}
```

### Backup Strategy

**Full Backup Before Deactivation:**
1. Before any destructive operation, generate full backup
2. Backup includes:
   - Agent database (SQLite)
   - Memory files
   - Communication history
   - Configuration and metadata
3. Backup is stored in:
   - Primary: Encrypted backup storage (S3 or local vault)
   - Secondary: Cold storage (optional, for long-term compliance)
4. Backup retention: 30 days (for INACTIVE), 90-365 days (for ARCHIVED)
5. After deletion, backup is kept per legal hold requirements

**Recovery Window:**
- INACTIVE agents can be restored within 30 days
- ARCHIVED agents can be restored within 90-365 days (configurable)
- DELETED agents cannot be recovered (permanent deletion)

### Compliance Preservation

For regulated environments:
- All termination events are immutable
- Audit trail is preserved for 7 years (configurable)
- Legal hold can freeze an agent indefinitely
- GDPR/right-to-be-forgotten supported via hard deletion
- Data retention policies enforced via scheduled jobs

---

## 9. API & Implementation Contract

### Agent Termination Interface

Located in: `packages/mastra-engine/src/agent/termination/`

```typescript
interface AgentTerminationAPI {
  // Mark agent as ready for shutdown (stop routing new messages)
  drain(agentId: string, options?: {
    drainDuration?: number;        // seconds to wait (default 3600)
    reason?: string;
    notifyDependents?: boolean;
  }): Promise<TerminationEvent>;

  // Deactivate agent (stop process, archive data)
  deactivate(agentId: string, options?: {
    reason?: string;
    preserveHistory?: boolean;  // default true
    backupLocation?: string;
  }): Promise<TerminationEvent>;

  // Archive agent to cold storage
  archive(agentId: string, options?: {
    compression?: 'zstd' | 'gzip';  // default zstd
    encrypt?: boolean;               // default true
    moveToColdstorage?: boolean;
  }): Promise<TerminationEvent>;

  // Permanently delete agent (non-recoverable)
  delete(agentId: string, options?: {
    force?: boolean;              // skip confirmation
    shredFiles?: boolean;         // overwrite before delete
    removeFromBackups?: boolean;  // attempt to remove from backups
  }): Promise<TerminationEvent>;

  // Freeze agent (legal hold)
  freeze(agentId: string, metadata?: {
    reason: string;
    legalHoldRef?: string;
    expiresAt?: Date;
  }): Promise<TerminationEvent>;

  // Release from legal hold
  unfreeze(agentId: string): Promise<TerminationEvent>;

  // Restore agent from backup
  restore(agentId: string, backupPath?: string): Promise<Agent>;

  // Get termination status and timeline
  getTerminationStatus(agentId: string): Promise<{
    state: AgentState;
    transitions: TerminationEvent[];
    backupAvailable: boolean;
    retentionUntil: Date;
    legalHold?: LegalHoldInfo;
  }>;

  // Query termination audit log
  getAuditLog(filters?: {
    agentId?: string;
    action?: string;
    dateRange?: [Date, Date];
    actor?: string;
  }): Promise<TerminationEvent[]>;
}
```

### Supporting Types

```typescript
type AgentState = 'ACTIVE' | 'DRAINING' | 'INACTIVE' | 'FROZEN' | 'ARCHIVED' | 'DELETED';

interface TerminationEvent {
  eventId: string;                    // unique event ID
  timestamp: Date;
  agentId: string;
  action: 'drain' | 'deactivate' | 'archive' | 'delete' | 'freeze' | 'unfreeze' | 'restore';
  actor: string;                      // user who initiated
  reason?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  previousState: AgentState;
  newState: AgentState;
  resourcesAffected: ResourcesAffected;
  backupGenerated?: {
    location: string;
    size: number;
    checksum: string;
    expiresAt: Date;
  };
  error?: string;                     // if status === 'failed'
}

interface ResourcesAffected {
  databaseSize: number;               // bytes
  memoryFilesSize: number;            // bytes
  communicationRecords: number;
  messageCount: number;
  conversationCount: number;
  providersRegistered: string[];
  childAgents: string[];
  toolInstances: number;
  estimatedCleanupTime: number;       // seconds
}

interface LegalHoldInfo {
  reason: string;
  legalHoldRef: string;
  appliedAt: Date;
  expiresAt?: Date;
  appliedBy: string;
}
```

---

## 10. CLI Commands

### CLI Interface

Located in: `packages/cli/src/commands/agent/terminate.ts`

```bash
# Drain agent (stop new messages)
forge agent drain <agentId> [--duration <seconds>] [--reason <string>]

# Deactivate agent (stop process, preserve data)
forge agent deactivate <agentId> [--reason <string>] [--no-backup]

# Archive agent (compress to cold storage)
forge agent archive <agentId> [--compression zstd|gzip] [--move-to-cold]

# Delete agent (permanent removal)
forge agent delete <agentId> [--force] [--shred] [--dry-run]

# Freeze agent (legal hold)
forge agent freeze <agentId> --reason <string> [--expires <date>]

# Unfreeze agent (release legal hold)
forge agent unfreeze <agentId>

# Restore agent from backup
forge agent restore <agentId> [--backup-path <path>]

# Show termination status
forge agent status <agentId>

# View termination audit log
forge agent audit-log [--agent <id>] [--action <action>] [--from <date>] [--to <date>]

# Perform cleanup (maintenance task)
forge maintenance cleanup [--dry-run] [--before-date <date>]
```

### Example Usage

```bash
# Gracefully terminate a chatbot
$ forge agent drain chatbot-v1 --duration 3600 --reason "Replaced by v2"
Agent chatbot-v1 is now DRAINING. Will deactivate in 1 hour.

$ forge agent deactivate chatbot-v1 --reason "End of life"
✓ Agent deactivated
✓ Backup created: s3://backups/agents/chatbot-v1/2025-03-15T10:30:00Z.tar.gz
✓ Data preserved until: 2025-04-15

# Delete an experimental agent
$ forge agent delete experimental-agent --dry-run
Resources to be deleted:
- Database: 150 MB
- Memory: 45 MB
- Conversations: 12
Delete? (y/N):

$ forge agent delete experimental-agent --force --shred
✓ Agent deleted permanently
✓ Files securely wiped
```

---

## 11. Integration Points

### Integration with Agent Registry

The agent registry must track:
- Current agent state
- State transition history
- Termination metadata
- Legal hold status
- Backup information

**Registry Updates:**
- `setAgentState(agentId, state)` — update agent state
- `getAgentState(agentId)` — query current state
- `recordTerminationEvent(event)` — log termination action
- `getTerminationHistory(agentId)` — get all transitions

### Integration with Communication Module

The communication module must:
- Implement `onTerminate(reason, preserveHistory)` hook
- Stop accepting inbound messages on DRAINING
- Archive conversation history on INACTIVE
- Cleanup provider credentials on ARCHIVED

**Communication Interface:**
```typescript
async onTerminate(options: {
  state: AgentState;
  preserveHistory: boolean;
  reason?: string;
}): Promise<void>;
```

### Integration with Memory System

Memory components must:
- Close database connections gracefully
- Flush pending operations
- Archive vector indexes
- Preserve metadata for recovery

**Memory Hooks:**
```typescript
async onTermination(state: AgentState): Promise<void>;
async archiveMemoryStore(): Promise<ArchiveInfo>;
```

### Integration with External Tools

Tool instances must:
- Cleanup any acquired resources (API keys, temp files, etc.)
- Disconnect from external services
- Archive credentials
- Return cleanup status

**Tool Interface:**
```typescript
async onAgentTermination(state: AgentState): Promise<{
  cleaned: boolean;
  resourcesFreed: Record<string, number>;
  error?: string;
}>;
```

### Integration with Monitoring & Alerting

- Alert when agent transitions to DRAINING
- Alert when agent enters FROZEN (legal hold)
- Alert when retention period is about to expire
- Remove agent from all active monitoring queries
- Preserve historical metrics for audit

---

## 12. Error Handling & Rollback

### Failure Scenarios

| Scenario | Action | Recovery |
|---|---|---|
| **Backup generation fails** | Log error, fail operation | Retry backup before proceeding |
| **Provider deregistration fails** | Log error, continue | Manual provider cleanup required |
| **Database compression fails** | Keep original, alert operator | Retry archive operation |
| **Partial deletion** | Rollback to previous state | Restore from checkpoint, retry |
| **Legal hold removal without auth** | Reject operation | Requires override with audit logging |

### Rollback Strategy

Each major operation creates a checkpoint:
1. Before draining, capture ACTIVE checkpoint
2. Before deactivating, capture DRAINING checkpoint
3. Before archiving, capture INACTIVE checkpoint

Rollback is possible within defined windows:
- DRAINING → ACTIVE: Always allowed (within drain period)
- INACTIVE → ACTIVE: Allowed within 30 days (backup available)
- ARCHIVED → ACTIVE: Allowed per retention policy

---

## 13. Success Metrics & Monitoring

### Key Performance Indicators

| Metric | Target | Threshold |
|---|---|---|
| **Drain completion time** | < 5 minutes | Alert if > 10 min |
| **Deactivation time** | < 30 seconds | Alert if > 1 min |
| **Archival time (per GB)** | < 60s | Alert if > 2 min/GB |
| **Backup success rate** | 99.9% | Alert if < 99% |
| **Backup restore time** | < 5 minutes | Alert if > 10 min |
| **Audit log completeness** | 100% | Alert if any gaps |
| **Storage cleanup accuracy** | 100% | Alert if orphaned files |
| **Recovery success rate** | 100% (within window) | Alert if failures |

### Monitoring Queries

```sql
-- Count of agents in each state
SELECT state, COUNT(*) FROM agent_states GROUP BY state;

-- Recent termination events
SELECT * FROM termination_audit_log ORDER BY timestamp DESC LIMIT 100;

-- Expired backups (overdue for deletion)
SELECT * FROM agent_backups WHERE expires_at < NOW();

-- Agents on legal hold
SELECT * FROM agents WHERE legal_hold = true;

-- Storage usage by inactive agents
SELECT agentId, database_size FROM agent_resources WHERE state != 'ACTIVE';
```

### Alerting Rules

- **Critical:** Failed termination operation (requires manual recovery)
- **Critical:** Backup deletion failure (data loss risk)
- **Warning:** Backup expiry approaching (< 7 days)
- **Warning:** Legal hold expired but agent not deleted (compliance risk)
- **Info:** Routine termination completed (audit trail)

---

## Future Enhancements

1. **Batch Termination:** Terminate multiple agents in a single operation
2. **Scheduled Termination:** Plan termination for specific date/time
3. **Conditional Cleanup:** Based on usage patterns or cost optimization
4. **Analytics Export:** Generate reports of agent activities before termination
5. **External Compliance:** Integration with compliance platforms (e.g., Vault for legal holds)
6. **Agent Migration:** Move agent state to different infrastructure before deletion
7. **Automated Retention Policies:** Define retention rules per agent type
8. **GDPR Automation:** Automatic deletion workflows for data subject requests
