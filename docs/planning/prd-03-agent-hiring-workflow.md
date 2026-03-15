# PRD-03: Agent Hiring Workflow

**Status:** Planning
**Date:** 2026-03-15

> **Note:** This is a personal solo-developer project. Requirements focus on functionality and simplicity.

---

## Objective

Enable internal agents to autonomously create and provision permanent specialist agents with specific roles, communication providers, and tools. Agent hiring follows Mastra workflow pattern similar to external agents but with persistent configuration.

---

## Requirements

### FR1: Create Agent with Role
- Internal agent requests to hire agent via tool
- Input: name, role, function, systemPrompt, providers (list), context (optional)
- Created using Mastra workflow (similar to `createSimpleAgent()`)
- Output: agentId, conversationId
- Agent saved in `agents` table with role/function metadata

### FR2: Provider Configuration
- System configures multiple providers per agent (Discord, Email, Slack, etc)
- Each provider gets credentials stored encrypted (via PRD-01 mechanism)
- Agent initialized with all provider credentials at startup
- Can communicate via all configured providers

### FR3: Role-Based Tools
- Agent assigned tools based on role/function
- Example: "research" role gets research tools, "developer" role gets development tools
- Tools loaded from tooling system based on role
- System prompt + role determines capabilities

### FR4: Agent Status Tracking
- Track agent lifecycle: provisioning, active, terminated
- Agent marked active after successful provisioning
- Hiring agent receives confirmation with agentId

---

## Architecture

### Components

1. **Workflow Integration** — Mastra workflow to create agent
2. **Role/Function System** — Maps role to capabilities, tools, constraints
3. **Provider Provisioning** — Configure multiple providers per agent (reuse PRD-01)
4. **Tool Injection** — Load tools based on agent role
5. **Agent Storage** — Agents table with role/function metadata

### Flow

```
Hiring Agent Request
  │
  ├─ tool: hireAgent({name, role, function, systemPrompt, providers, context})
  │
  ├─ Validate role exists
  │
  ├─ Mastra workflow creates agent
  │  ├─ agentId = UUID
  │  ├─ instructions = systemPrompt + context
  │  ├─ model = default or role-specific
  │  └─ Save in agents table with role/function
  │
  ├─ Configure providers
  │  └─ For each provider: encrypt credentials, store in agent_providers
  │
  ├─ Load tools for role
  │  └─ Agent initialized with role-specific tools
  │
  └─ Return agentId + conversationId
```

---

## Database Schema

**Extensions to agents table:**
- `role` (TEXT) — role/function identifier
- `function` (TEXT) — organizational function
- `is_active` (BOOLEAN) — whether agent is active

**No new tables needed.** Reuse `agent_providers` from PRD-01 for credentials.

---

## Technical Decisions

### 1. Use Mastra Workflow (like External Agents)
**Decision:** Hiring workflow creates agents via Mastra workflow

**Rationale:**
- Consistent with external agent creation
- Reuses existing agent creation patterns
- Simpler than separate hiring infrastructure

### 2. Role-Based Tool Injection
**Decision:** Tools loaded from role configuration at agent creation

**Rationale:**
- Tools determined by role/function
- Simple role → tools mapping
- No dynamic tool loading needed

### 3. Reuse Provider System (PRD-01)
**Decision:** Provider credentials stored/encrypted same way as PRD-01

**Rationale:**
- Consistent encryption
- No duplication
- Centralized credential management

### 4. Persistent Agents
**Decision:** Hired agents persistent (unlike external agents)

**Rationale:**
- Hired agents expected to run indefinitely
- No auto-termination
- Termination is explicit admin action
