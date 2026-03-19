# PRD-04: Agent Termination Workflow

**Status:** Implemented
**Data:** 2026-03-18

## Objective

Define the workflow used to terminate a permanent agent from the company.

Termination is simple:
- remove the agent from the company
- stop the agent in the runtime
- delete the agent resources
- clean up stored data that belongs to the agent runtime

This is a hard termination workflow.

## Scope

This PRD covers:
- terminating an agent by workflow
- removing the agent from the runtime
- deleting the agent record
- deleting agent-owned runtime files and databases
- cleaning provider credentials and related runtime data

This PRD does not cover:
- graceful shutdown logic
- agent recovery
- retention policies
- compliance/audit requirements
- financial reconciliation logic

## Core Idea

If an agent is terminated, it leaves the company.

The system should:
- stop using that agent
- remove it from the runtime
- delete its operational data and files
- clean the environment

This is not a soft archival process.
It is a direct removal process.

## Main Flow

### 1. Receive Termination Request

A workflow receives a request to terminate an agent.

Input:
- `agentId`
- optional reason

### 2. Validate Agent Exists

The workflow confirms that the target agent exists.

### 3. Remove Agent from Runtime

Before deleting persistent resources, the workflow removes the agent from the runtime registry / instantiated agent list.

This ensures the agent is no longer active in memory.

### 4. Delete Agent Registry Record

The workflow deletes the agent from the company agent registry.

This is a hard delete.

### 5. Delete Provider Credentials and Related Records

The workflow deletes provider configuration records related to the agent.

This includes:
- provider credentials
- related provider records owned by the agent

### 6. Delete Agent Runtime Files

The workflow deletes the agent workspace directory.

Current runtime layout:

```text
workspaces/
  {agentId}/
    database.db
    workspace/
    workspace-memory/
```

So termination should remove:
- `workspaces/{agentId}/database.db`
- `workspaces/{agentId}/workspace/`
- `workspaces/{agentId}/workspace-memory/`
- and finally `workspaces/{agentId}/`

### 7. Return Confirmation

The workflow returns confirmation that the agent was terminated and its resources were removed.

## Current Resource Model

The workflow should assume the agent owns these runtime resources:
- agent registry record
- provider configuration records
- runtime instance in memory
- workspace directory
- agent database file
- workspace-memory directory

If more agent-owned resources are added later, they can be included in the same cleanup workflow.

## Database Direction

No new table is required for the first version.

The main records affected are:
- `agents`
- provider records related to the agent

Termination should remove those records completely.

## File System Direction

The workflow should delete the full agent workspace root:
- `workspaces/{agentId}/`

That keeps the cleanup simple and avoids leaving orphan files.

## Design Rules

- Termination is a hard delete.
- The agent should be removed from the runtime before persistent cleanup finishes.
- Agent-owned files should be deleted completely.
- Cleanup should target the real runtime paths used by the application.
- The workflow should stay simple and direct.

## Summary

This PRD defines agent termination as a direct removal workflow.

The workflow receives an `agentId`, removes the agent from the runtime, deletes the registry and provider records, removes the full workspace directory under `workspaces/{agentId}/`, and returns confirmation.

This keeps agent termination simple: terminate, clean up, and free the space.

## Implementation Status

Implemented today:
- internal termination workflow exists in the Forge app
- the workflow removes the agent from the internal in-memory registry before cleanup
- the agent row is hard-deleted from the database
- provider records are removed through database cascade
- the full `workspaces/{agentId}/` directory is deleted recursively

Current implementation note:
- like hiring, termination must happen inside the running Forge app process because it mutates the live in-memory agent registry
