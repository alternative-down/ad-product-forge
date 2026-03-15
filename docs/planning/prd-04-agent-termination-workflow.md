# PRD-04: Agent Termination Workflow

**Status:** Planning
**Date:** 2026-03-15

> **Note:** This is a personal solo-developer project. Requirements focus on functionality and simplicity.

---

## Objective

Enable agents to autonomously terminate other agents (or admin to terminate any agent). Termination workflow uses Mastra workflow pattern to cleanly remove agent from system and clean up resources.

---

## Requirements

### FR1: Terminate Agent via Workflow
- Agent requests to terminate agent via tool (similar to hiring)
- Input: agentId, reason (optional)
- Uses Mastra workflow pattern
- Output: confirmation with deleted resources

### FR2: Resource Cleanup
- Delete agent from `agents` table
- Cascade delete from `agent_providers` table (via FK)
- Delete agent database files (if any: `{agentId}.db`)
- Delete agent memory/state files (`.forge-memory/{agentId}/`)
- Clean up any agent-specific temporary files

### FR3: Termination Confirmation
- Return confirmation with list of resources deleted
- Log termination event (audit trail)

---

## Architecture

### Components

1. **Termination Workflow** — Mastra workflow invoked by agent
2. **Cascade Deletion** — Database constraints cascade FK deletions
3. **File Cleanup** — Find and delete agent-specific files
4. **Logging** — Record termination event

### Flow

```
Agent Request (via tool)
  │
  ├─ tool: terminateAgent({agentId, reason})
  │
  ├─ Mastra workflow executes
  │  ├─ Validate agentId exists
  │  ├─ Delete from agents table
  │  ├─ Cascade: delete from agent_providers
  │  ├─ Find and delete {agentId}.db
  │  ├─ Find and delete .forge-memory/{agentId}/
  │  ├─ Log termination event
  │  └─ Return confirmation
  │
  └─ Return list of deleted resources
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
