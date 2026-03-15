# PRD-05: Agent Hiring Workflow

> **Note:** Este é um projeto pessoal de desenvolvedor solo. Requisitos focam em funcionalidade, não robustez corporativa.

## 1. Executive Summary

### Classification: MASTRA FRAMEWORK

**This PRD describes core agent lifecycle management for the Mastra framework.** The ability for agents to autonomously create and provision other agents is a fundamental capability for sophisticated multi-agent systems. This is framework-level infrastructure that enables self-organizing agent hierarchies in any Mastra deployment.

**Feature Name:** Agent Hiring Workflow

**Objective:** Enable autonomous agents to create and provision new agents, with a complete workflow for agent creation, configuration, and deployment.

**Value (Framework):**
- **Self-Organizing Systems:** Agents can autonomously scale teams based on operational needs
- **Delegation Pattern:** Foundation for hierarchical agent organizations
- **Reusable Workflow:** Applicable to any multi-agent Mastra deployment
- **Permission-Safe:** Integration with role/permission system ensures safe agent creation

**Value (ad-product-forge):**
- **Dynamic Scaling:** Nicolas' agents autonomously create specialist agents for research, development, marketing
- **Team Formation:** Agents can hire consultants for specific tasks
- **Autonomous Operation:** Master agent initializes system with minimal human intervention

---

## 2. Problem Statement

### Current State
- Agent creation is manual and static, requiring human intervention
- No mechanism for agents to autonomously provision new agents
- Lack of standardized workflow for agent lifecycle management
- Missing configuration and communication setup automation

### Challenges
- Agents need permission to create other agents
- Each new agent requires communication provider setup
- Need validation and constraints on agent creation parameters
- Need integration with role/permission system

### Impact
- Enables autonomous team formation
- Allows multi-agent coordination scenarios
- Enables agents to respond to workload scaling needs

---

## 3. Target Users & Use Cases

### Primary Users
- Autonomous agents with hiring permissions
- Master agent initializing system setup
- Specialist agents creating task-specific sub-agents

### Use Cases

#### UC1: Master Agent Initial Hiring
As the master agent, I need to hire initial specialist agents (research, development, marketing) so that core functions can be distributed across specialized agents.

- Master agent defines role, capabilities, and communication providers
- System creates agent account, provisions communication channels
- Agent becomes available and operational

#### UC2: Agent Team Scaling
As an operations agent, I need to hire additional agents when workload increases so that tasks can be handled in parallel.

- Operations agent identifies need for capacity
- Requests new agent with specific configuration
- System provisions agent with appropriate role and constraints
- New agent joins communication channels and begins work

#### UC3: Specialist Consultant Creation
As a project agent, I need to hire temporary specialist agents (reviewers, consultants) for specific tasks so that I can get expert input.

- Project agent defines specialist requirements
- System creates external-class agent with restricted permissions
- Specialist agent communicates via internal messaging only
- Specialist agent terminates when task completes

#### UC4: Communication Provider Setup
As a newly hired agent, I need communication providers configured so that I can receive messages and collaborate with other agents.

- Hiring agent specifies which providers to set up (Discord, Email, etc.)
- System provisions credentials and account information
- Agent receives provider credentials and initializes communication module
- Agent can immediately participate in conversations

---

## 4. Requirements

### Functional Requirements

#### FR1: Agent Creation Request
- Agents with hiring permissions can submit agent creation requests
- Request must specify:
  - `agentName` (unique identifier)
  - `agentDisplayName` (human-readable name)
  - `role` (link to role/permission system)
  - `function` (organizational function)
  - `agentType` ("permanent" | "specialist" | "temporary")
  - `durationDays` (if temporary, auto-termination date)
  - List of communication providers to configure
  - Optional custom system prompt or context
  - Optional resource allocation parameters
- System validates request against hiring agent's permissions

#### FR2: Agent Account Creation
- System generates unique agent ID (UUID)
- Creates agent record with metadata
- Records creation audit trail

#### FR3: Communication Provider Configuration
- System supports configurable provider list per agent
- For each provider:
  - Generate provider credentials
  - Encrypt and store
  - Return configuration to agent
- Validates provider availability

#### FR4: Agent Parameter Configuration
- Support configurable parameters:
  - `model` (LLM)
  - `temperature`
  - `tools`
  - `providers`
  - `permissions`
- Parameters can be templated by role
- System validates parameters

#### FR5: Agent Provisioning
- System orchestrates provisioning:
  1. Create agent account
  2. Configure communication providers
  3. Store credentials
  4. Initialize agent runtime
  5. Send activation message
- Error handling and rollback on failures

#### FR6: Agent Activation & Notification
- After provisioning, agent becomes available
- Hiring agent receives confirmation with agent ID
- Agent receives initialization message

#### FR7: Permission & Authorization
- Only agents with hiring permission can create agents
- Master agent has unrestricted rights
- System enforces permission checks

#### FR8: Configuration Validation
- Validate agent parameters:
  - Unique agent name
  - Valid role exists
  - Valid function exists
  - Providers available
  - Resources available
- Return validation errors

#### FR9: Agent Status Tracking
- Track lifecycle states: provisioning, active, inactive, terminating, terminated
- Expose status via API

#### FR10: Batch Agent Hiring
- Support hiring multiple agents
- Process sequentially
- Partial failure handling
- Atomic operation preferred

### Non-Functional Requirements

- Encrypt credentials at rest
- Sanitize logs (no credentials)
- Authorize before credential access
- Idempotent operations
- Rollback on failures
- Agent creation within 30 seconds
- Log all hiring operations

---

## 5. Solution Architecture

### High-Level Flow

```
Hiring Agent Request
    ↓
[Authorization Check]
    ↓
[Validate Parameters]
    ↓
[Create Agent Account]
    ├─ Generate Agent ID
    ├─ Create DB Record
    ├─ Store Metadata
    └─ Mark as "provisioning"
    ↓
[Configure Providers] (parallel/sequential)
    ├─ Create Provider Account (per provider)
    ├─ Generate Credentials
    ├─ Encrypt & Store
    └─ Configure Provider Settings
    ↓
[Initialize Agent Runtime]
    ├─ Create Agent Context
    ├─ Register Communication Module
    └─ Load Tools & Permissions
    ↓
[Mark as Active]
    ↓
[Notify Systems]
    ├─ Notify Hiring Agent
    ├─ Notify Master Agent
    └─ Emit Agent-Ready Event
```

### Component Interactions

#### Authentication & Authorization Module
- Validates hiring agent identity
- Checks hiring permissions
- Enforces role-based access control
- Returns authorized capabilities

#### Agent Management Service
- Orchestrates entire hiring workflow
- Coordinates multi-step provisioning
- Manages agent lifecycle states
- Handles error recovery and rollback

#### Database Layer (Drizzle ORM)
- Stores agent configurations
- Manages provider credentials (encrypted)
- Tracks agent status and audit trail
- Provides consistent data access

#### Communication Provider Registry
- Maintains available providers
- Manages provider-specific configuration
- Handles credential generation per provider
- Supports provider-agnostic interface

#### Secrets Management
- Encrypts credentials at rest
- Manages encryption keys
- Provides secure credential retrieval
- Supports credential rotation

#### Agent Runtime Factory
- Creates new agent instances
- Initializes communication modules
- Loads tools and permissions
- Configures LLM parameters

### Data Model

#### Agent Table
```
agents {
  id: UUID (primary key)
  name: string (unique)
  displayName: string
  type: enum ("permanent" | "specialist" | "temporary")
  role: foreign key → roles table
  function: foreign key → functions table
  createdAt: timestamp
  createdBy: UUID (hiring agent)
  activatedAt: timestamp
  terminatedAt: timestamp (nullable)
  status: enum ("provisioning" | "active" | "inactive" | "terminating" | "terminated")
  metadata: JSON (custom configuration)
  durationDays: int (nullable, for temporary agents)
}
```

#### Provider Credentials Table
```
providerCredentials {
  id: UUID (primary key)
  agentId: UUID (foreign key)
  provider: string (e.g., "discord", "email")
  externalAccountId: string
  credentials: encrypted_string (stored encrypted)
  createdAt: timestamp
  rotatedAt: timestamp (nullable)
  status: enum ("active" | "inactive" | "expired")
  metadata: JSON (provider-specific data)
}
```

#### Audit Log Table
```
hiringAuditLog {
  id: UUID (primary key)
  timestamp: timestamp
  action: string ("agent_created" | "agent_activated" | "provider_configured", etc.)
  agentId: UUID (if applicable)
  hiringAgentId: UUID
  details: JSON (action-specific data)
  status: enum ("success" | "failure")
  errorMessage: string (nullable)
}
```

---

## 6. Integration Points

### Role & Permission System
- Uses role definitions from section 3.1 (ROADMAP.md)
- Agent creation requires hiring role
- New agent assigned initial role at creation
- Permission inheritance follows role hierarchy
- Master agent initialization entry point

### Communication Module
- Uses existing communication provider contract
- Provisions providers as part of agent setup
- Agent receives provider credentials post-creation
- Internal messaging used for agent notifications

### Database Layer (Drizzle ORM)
- Uses existing database infrastructure
- Extends agent configuration schema
- Adds provider credentials table
- Integrates with existing encryption strategy

### Agent Runtime
- Uses createForgeAgent() from create-forge-agent.ts
- Passes configuration parameters to runtime
- Initializes communication module with provider list
- Returns fully functional agent instance

### Wake Queue System
- Integration point for activation notifications
- Agent wakes on creation completion
- Hiring agent receives notification via message

### Event System
- Emit agent creation events
- Integration with external webhooks if configured
- Support for system-wide agent lifecycle tracking

---

## 7. User Stories & Acceptance Criteria

### User Story 1: Master Agent Hires Initial Specialists
```
As the master agent,
I want to hire specialized agents (research, dev, ops),
So that I can delegate different functions to appropriate specialists.

Acceptance Criteria:
- Master agent can create 3+ agents with different roles in single request
- Each agent receives unique ID and credentials
- Each agent has configured communication providers
- System creates audit trail for each hiring
- All agents become active and receive initialization message
- Master agent can list newly hired agents
```

### User Story 2: Operational Agent Scales Team
```
As an operations agent,
I want to hire additional agents when workload increases,
So that tasks can be processed in parallel.

Acceptance Criteria:
- Operations agent can submit agent creation request
- System validates operations agent has hiring permission
- New agent provisioned within 30 seconds
- New agent automatically joins team communication channels
- Operations agent receives confirmation with agent details
- Hiring audit trail records operations agent as creator
```

### User Story 3: Specialist Agent Terminates After Task
```
As a project agent,
I want to hire temporary specialist agents,
So that I can get expert consultation without permanent headcount.

Acceptance Criteria:
- Project agent can specify agent type as "specialist"
- Agent has restricted permissions (messaging only)
- Agent auto-terminates after specified duration
- Auto-termination triggers cleanup workflow
- Final agent status recorded as terminated
```

### User Story 4: Verify Agent Communication Ready
```
As a newly hired agent,
I want to have communication providers configured,
So that I can immediately participate in team conversations.

Acceptance Criteria:
- Agent receives provider credentials upon activation
- Agent can connect to Discord (if configured)
- Agent can send/receive Discord messages
- Agent can connect to Email (if configured)
- Agent can process inbound emails
- Agent can send emails to team
```

### User Story 5: Manager Reviews Hiring Activity
```
As a system administrator,
I want to review agent hiring audit trail,
So that I can track agent creation and compliance.

Acceptance Criteria:
- Audit log records all hiring operations
- Log includes timestamp, creator, agent details
- Log excludes sensitive credential information
- Can filter audit log by date range, creator, status
- Can export audit report for compliance
```

---

## 8. Success Metrics

### Functional Success
1. **Agent Creation Time**: 95% of agent creations complete within 30 seconds
2. **Provider Configuration Success**: 99% of provider configurations complete successfully
3. **Authorization Enforcement**: 100% of unauthorized hiring attempts blocked
4. **Parameter Validation**: 100% of invalid parameters rejected with clear error messages

### Operational Success
1. **Hiring Workflow Reliability**: 99.5% successful agent provision rate
2. **Error Recovery**: 100% of provider failures result in automatic rollback
3. **Credential Security**: 100% of credentials encrypted at rest

### User Experience Success
1. **Feedback Quality**: Clear error messages enable self-service resolution
2. **Documentation Completeness**: Hiring workflows documented with examples

---

## 9. Risk Analysis & Mitigation

### Risk 1: Unrestricted Agent Creation (Security)
**Risk:** Malicious agents exploit hiring permissions to create excessive agents.

**Mitigation:**
- Implement strict permission model (only specific agents can hire)
- Rate limiting on hiring operations

### Risk 2: Provider Credential Exposure (Security)
**Risk:** Credentials stored improperly or exposed in logs.

**Mitigation:**
- Encrypt all credentials at rest
- Never log credential values

### Risk 3: Partial Provisioning Failure (Reliability)
**Risk:** Provider setup fails mid-process.

**Mitigation:**
- Automatic rollback on provider failures
- Provider timeout protection
- Idempotent operations

### Risk 4: Invalid Configuration Parameters (Usability)
**Risk:** Hiring agents create agents with invalid configuration.

**Mitigation:**
- Comprehensive parameter validation
- Clear error messages
- Configuration templates

---

## 10. Out of Scope

- Agent specialization templates (future)
- Advanced resource allocation
- Multi-region provisioning
- Automated team optimization (future)
- Agent skill assessment (future)

---

## 11. Future Enhancements

- Agent performance monitoring
- Automatic scaling based on workload
- Agent team organization
- Skills inventory and matching
- Configuration templates library
- Cost-aware agent creation

---

## 12. Implementation Plan

### Phase 1: Core Hiring Workflow
- Design database schema
- Implement authorization checks
- Create agent creation service
- Implement validation logic
- Basic error handling

### Phase 2: Provider Configuration
- Implement provider registry integration
- Create credential encryption/decryption
- Provider setup

### Phase 3: Agent Runtime & Activation
- Integrate with createForgeAgent() factory
- Initialize communication module
- Implement activation notifications

### Phase 4: Testing & Documentation
- End-to-end testing
- Documentation

---

## 13. Success Criteria & Validation

### Functional Validation
- [ ] Agent can be created via API request
- [ ] Agent account stored in database
- [ ] Agent parameters validated
- [ ] Provider credentials encrypted
- [ ] Agent receives provider configuration
- [ ] Agent connects to configured providers
- [ ] Agent participates in communications
- [ ] Audit trail records all operations
- [ ] Permissions enforced

### Non-Functional Validation
- [ ] Agent creation completes within 30 seconds
- [ ] Zero credential exposure in logs
- [ ] Automatic rollback on failures
- [ ] All errors logged
- [ ] Credentials encrypted at rest
- [ ] Authorization enforcement verified

---

## Appendix A: Related Systems

### Agent Lifecycle (Section 4.1-4.3 in ROADMAP)
- Agent Hiring Workflow (this PRD) — creation and provisioning
- Agent Termination Workflow — graceful removal and cleanup
- Heartbeat & Scheduling System — keep agents active

### Role & Permission Management (Section 3.1 in ROADMAP)
- Roles define hiring capabilities
- Master agent grants hiring permissions
- New agents assigned roles upon creation

### Communication System (Section 5.1-5.3 in ROADMAP)
- Communication providers configured at agent creation
- Agent communication module initialized post-provisioning
- Group chat support for agent teams

### Database-Driven Agents (Section 1.1 in ROADMAP)
- Agent configuration stored in database
- Credentials encrypted at rest
- Drizzle ORM used for data access

---

## Appendix B: Example Agent Creation Request

```json
{
  "agentName": "research-specialist-01",
  "agentDisplayName": "Research Specialist - Markets",
  "role": "specialist-researcher",
  "function": "research",
  "agentType": "permanent",
  "providers": ["discord", "email"],
  "customSystemPrompt": "You are a market research specialist...",
  "parameters": {
    "model": "claude-opus-4-5",
    "temperature": 0.7,
    "tools": ["web-search", "data-analysis", "report-generation"],
    "maxDailyOperations": 1000,
    "financialBudget": 50
  },
  "metadata": {
    "team": "research",
    "reportingManager": "operations-agent-01"
  }
}
```

## Appendix C: Example Batch Hiring Request

```json
{
  "batchName": "initial-team-setup",
  "agents": [
    {
      "agentName": "dev-specialist",
      "agentDisplayName": "Development Specialist",
      "role": "developer",
      "function": "development",
      "providers": ["discord"]
    },
    {
      "agentName": "ops-specialist",
      "agentDisplayName": "Operations Manager",
      "role": "operations-manager",
      "function": "operations",
      "providers": ["discord", "email"]
    },
    {
      "agentName": "research-specialist",
      "agentDisplayName": "Research Analyst",
      "role": "researcher",
      "function": "research",
      "providers": ["email"]
    }
  ],
  "atomicOperation": true
}
```

