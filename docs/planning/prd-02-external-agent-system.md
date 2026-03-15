# PRD-02: External Agent System

**Status:** Planning
**Date:** 2026-03-15

> **Note:** This is a personal solo-developer project. Requirements focus on functionality and simplicity.

---

## Objective

Enable internal agents to dynamically create temporary specialist agents for consultation, research, or delegation tasks. External agents are regular agents created via workflow, communicate via standard messaging provider, and can be terminated when tasks complete.

---

## Requirements

### FR1: Create External Agent
- Internal agent requests to create external agent via tool
- Input: name, role, systemPrompt, context (optional)
- External agent created using `createSimpleAgent()` with workflow
- Returned: externalAgentId, conversationId
- External agent saved in `agents` table (no separate table)

### FR2: Communication
- External agent communicates via `sendMessage()` / `getMessages()` tools
- Uses `external_agent_chat` provider (similar to internal chat)
- Messages routed between internal and external agent only

### FR3: Termination
- Internal agent can terminate external agent
- External agent marked as terminated in database
- Messages no longer accepted

---

## Architecture

### Components

1. **Workflow Integration** — Use Mastra workflow to create external agent
2. **External Agent Chat Provider** — New provider `external_agent_chat` (copy of internal chat)
3. **Agent Storage** — External agents stored in `agents` table (same as regular agents)
4. **Messaging** — Use existing communication module tools

### Flow

```
Internal Agent invokes external agent workflow
  │
  ├─ Mastra workflow: createExternalAgent({name, role, systemPrompt, context})
  │
  ├─ Workflow creates agent:
  │  ├─ agentId = UUID (marks as external)
  │  ├─ instructions = systemPrompt + context
  │  ├─ model = same as parent
  │  └─ Save in agents table
  │
  └─ Return agentId + conversationId

Communication (uses standard messaging)
  │
  ├─ sendMessage(externalAgentId, content)
  │  └─ Message via external_agent_chat provider
  │
  ├─ Agent receives, generates response
  │  └─ Response via sendMessage()
  │
  └─ getMessages(externalAgentId)

Termination
  │
  └─ Mastra workflow: terminateExternalAgent(externalAgentId)
     └─ Mark agent status = "terminated"
```

---

## Database Schema

**No new tables needed.** External agents stored in existing `agents` table.

**Additions to agents table:**
- `is_external` (boolean, default false)
- `parent_agent_id` (TEXT, optional - tracks creator)
- `terminated_at` (TIMESTAMP, optional)

---

## Provider: External Agent Chat

New provider configuration:
- Name: `external_agent_chat`
- Type: Internal messaging (no external credentials)
- Enables messaging between internal and external agents only
- Based on existing internal chat provider

---

## Technical Decisions

### 1. Use Existing Agent Creation
**Decision:** External agents = regular agents created via workflow

**Rationale:**
- Simpler than separate infrastructure
- Reuses existing agent capabilities
- System prompt provides scope/expertise definition

### 2. Existing Messaging Tools
**Decision:** Use standard `sendMessage()` / `getMessages()` for communication

**Rationale:**
- No duplicate tools needed
- Provider routing handles agent isolation
- Same API for all agents

### 3. Same Agents Table
**Decision:** External agents stored in `agents` table with flags

**Rationale:**
- No schema duplication
- Unified agent lifecycle management
- Simpler queries and admin operations
