# PRD-04: Agent Termination Workflow

**Status:** Planning
**Date:** 2026-03-15

> **Note:** This is a personal solo-developer project. Requirements focus on functionality and simplicity.

---

## Objective

Enable safe removal of agents from the system. Agent termination cleans up resources (database, memory files) and removes agent from registry.

---

## Requirements

### FR1: Delete Agent
- Internal agent or admin requests to terminate agent via tool
- Input: agentId, reason (optional)
- Requires confirmation (prevent accidents)
- Agent removed from `agents` table

### FR2: Resource Cleanup
- Delete agent database files (if any)
- Delete agent memory/state files (`.forge-memory/{agentId}/`)
- Delete agent-provider credentials from `agent_providers` table
- Clean up any agent-specific temporary files

### FR3: Termination Confirmation
- Return confirmation with details of what was deleted
- Log termination with reason (audit trail)

---

## Architecture

### Components

1. **Termination Tool** — Tool available to agents or admin
2. **Resource Locator** — Find all agent-related files/data
3. **Cleanup Process** — Delete database, files, registry entries
4. **Logging** — Record termination for audit

### Flow

```
Termination Request
  │
  ├─ tool: terminateAgent({agentId, reason})
  │
  ├─ Confirm termination (prevent accidents)
  │
  ├─ Delete from agents table
  │
  ├─ Delete from agent_providers table
  │
  ├─ Delete database files ({agentId}.db)
  │
  ├─ Delete memory files (.forge-memory/{agentId}/)
  │
  ├─ Log termination event
  │
  └─ Return confirmation
```

---

## Database Schema

**No new tables needed.**

**Changes to agents table:**
- Optional: add `terminated_at` (TIMESTAMP) to track when agent was deleted
- Or: simply delete row from table

**Cascading deletes:**
- `agent_providers`: delete all rows where `agent_id = {agentId}`
- This clears all credentials automatically

---

## Technical Decisions

### 1. Hard Delete vs Soft Delete
**Decision:** Hard delete (remove from table completely)

**Rationale:**
- Solo dev project, no compliance/audit retention needed
- Simpler data model
- No need for deleted agent recovery

### 2. Cascade Deletion
**Decision:** Delete all related records (agent_providers, credentials)

**Rationale:**
- Clean removal
- No orphaned credentials
- Database constraints ensure consistency

### 3. File Cleanup
**Decision:** Delete agent database files and memory directories

**Rationale:**
- Free up disk space
- Clean system state
- No orphaned files
