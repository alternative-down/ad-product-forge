# PRD-04: Role and Function Schema

**Status:** In Progress
**Last Updated:** 2026-03-15
**Author:** Platform Team
**Document Version:** 1.0

---

## 1. Executive Summary

The **Role and Function Schema** feature establishes a granular, hierarchical access control and capability system for agents within the Forge platform. This system enables organizations to define clear agent roles (with specific permissions), group agents by function (operational classification), and support permission delegation across the agent network.

The feature implements a master agent pattern where a designated master agent initializes base configurations and manages permission grants/revokes for other agents, supporting multi-level delegation and role escalation while maintaining organizational coherence.

**Key Value:**
- **Granular Control:** Define what each agent can access (Tools, Providers, Workflows)
- **Organizational Clarity:** Represent agent positions within organizational structure
- **Secure Delegation:** Master agent grants permissions safely; agents can be authorized to modify their own role configurations
- **Scalability:** Support complex permission hierarchies and role inheritance across agent networks

---

## 2. Problem Statement

### Current State
Currently, agents in the Forge platform have flat capability structures. Tools, providers, and workflows are assigned without a structured framework that reflects:
- Agent functional roles (marketing agent, sales agent, operations agent, etc.)
- Organizational hierarchy and reporting structure
- Granular access controls to sensitive operations
- Clear permission boundaries and escalation paths

### Problems This Solves

1. **Lack of Organizational Structure**
   - Agents cannot be grouped by function or role
   - No clear representation of agent positions within the company
   - Difficult to manage large agent networks with diverse responsibilities

2. **Uncontrolled Permission Model**
   - All agents have access to all capabilities
   - No mechanism to restrict sensitive operations (e.g., billing, user management)
   - No audit trail for permission changes
   - No delegation mechanism between agents

3. **Scalability Issues**
   - Manual capability assignment becomes unmanageable as agent count grows
   - No template-based role system for rapid agent onboarding
   - Difficulty enforcing consistent security policies across the organization

4. **Operational Risk**
   - Agents can access tools/providers they shouldn't
   - No escalation path for temporary permission elevation
   - No mechanism to revoke permissions when agent responsibilities change

---

## 3. Goals and Success Metrics

### Primary Goals

1. **Implement Hierarchical Role System**
   - Define roles (Manager, Specialist, Worker, Admin)
   - Assign capabilities to roles (not directly to agents)
   - Support role inheritance and composition

2. **Implement Function Classification**
   - Group agents by operational function (Marketing, Sales, Ops, Finance, etc.)
   - Use function as organizational context for permission decisions
   - Enable function-based capability templates

3. **Enable Safe Delegation**
   - Master agent can grant/revoke permissions
   - Authorized agents can modify their own role configurations (within bounds)
   - Support escalation workflows for temporary elevation
   - Maintain audit trail of all permission changes

4. **Provide Clear Permission Boundaries**
   - Define which tools, providers, and workflows each role can access
   - Implement checking before agent actions
   - Support granular permission scoping (function-level, tool-level, workflow-level)

### Success Metrics

| Metric | Target | Measurement |
| --- | --- | --- |
| **Role Assignment Coverage** | 100% of agents have explicit role | Audit query on agent table |
| **Permission Grant Latency** | < 500ms | Master agent test scenarios |
| **Permission Check Performance** | < 10ms overhead per action | Profiling during agent execution |
| **Audit Trail Completeness** | 100% of permission changes logged | Query audit_role_changes table |
| **Master Agent Initialization Time** | < 2s | Test suite execution time |
| **Role Template Reusability** | 3+ agents per template | Role management dashboard stats |
| **Permission Revocation Consistency** | All cascade deletes verified | Integration test suite |

---

## 4. Proposed Solution

### 4.1 Core Architecture

#### Function Schema
Functions are operational groupings that classify agents by their primary domain:

```typescript
interface Function {
  id: string                    // UUID or slug (e.g., "marketing", "sales")
  name: string                  // Human-readable name
  description: string           // Purpose and responsibilities
  parentFunctionId?: string     // Support hierarchical functions
  metadata?: Record<string, unknown>  // Tags, custom attributes
  createdAt: string
  updatedAt: string
}
```

**Example Functions:**
- `marketing` — Handles campaign, content, and audience management
- `sales` — Manages pipeline, deals, and customer relations
- `operations` — Process execution, system health, agent coordination
- `finance` — Billing, budgets, financial reporting
- `product-management` — Feature planning, roadmap, requirements

#### Role Schema
Roles define permissions and capabilities for agents. Roles are assigned to agents and can span multiple functions.

```typescript
interface Role {
  id: string                    // UUID or slug (e.g., "marketing-specialist")
  name: string                  // Human-readable name
  description: string           // Role responsibilities
  functionIds: string[]         // Functions this role applies to

  // Capability grants
  toolAccess: {
    allowed: string[]           // Tool IDs this role can use
    denied: string[]            // Explicit denials (override allows)
  }

  providerAccess: {
    allowed: string[]           // Provider IDs (email, Slack, etc.)
    denied: string[]
  }

  workflowAccess: {
    allowed: string[]           // Workflow IDs this role can execute
    denied: string[]
  }

  // Special permissions
  permissions: {
    canModifyOwnRole: boolean   // Can agent modify their own role (within scope)
    canGrantPermissions: boolean // Can agent grant permissions to others
    canRevokePermissions: boolean
    canCreateAgents: boolean
    canModifyAgents: boolean
    canDeleteAgents: boolean
    isAdmin: boolean            // Master admin permissions
  }

  // Escalation support
  escalationPath?: {
    roleId: string              // Role that can approve escalation
    maxDurationMs?: number      // How long temporary elevation lasts
  }

  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}
```

**Example Roles:**
- `admin` — Master role with all permissions
- `marketing-manager` — Manages marketing team, can create/modify marketing agents
- `marketing-specialist` — Executes marketing workflows, limited tool access
- `sales-rep` — Can access CRM, email, communication workflows

#### Agent Role Assignment

Agents receive role assignments with optional scope binding:

```typescript
interface AgentRoleAssignment {
  id: string                    // UUID
  agentId: string              // Agent being assigned role
  roleId: string               // Role being assigned
  functionId?: string          // Optional function scope
  grantedAt: string
  grantedBy: string            // Agent ID of who granted this
  expiresAt?: string           // Optional expiration for temporary grants
  metadata?: Record<string, unknown>

  // Audit trail
  auditLog: Array<{
    action: 'created' | 'modified' | 'escalated' | 'revoked'
    timestamp: string
    actor: string               // Who performed action
    reason?: string
  }>
}
```

### 4.2 Master Agent Pattern

A designated master agent bootstrap the entire role/function system and manages permission lifecycle:

#### Initialization Phase
1. Master agent creates base roles (admin, basic worker, etc.)
2. Master agent creates primary functions
3. Master agent assigns itself the admin role
4. System is ready for agent creation and permission delegation

#### Operation Phase
1. **Permission Grant**
   - Only master agent or authorized agents can grant roles to others
   - Grants create AgentRoleAssignment records
   - Audit trail captures who, what, when, why

2. **Permission Revocation**
   - Master agent can revoke any role
   - Revocation cascades: removes agent access to all role-based resources
   - Audit trail records revocation reason

3. **Permission Escalation**
   - Agent requests temporary elevated permissions
   - Master agent (or escalation target) approves with expiration time
   - System enforces time-limited access
   - Automatic revocation when expiration passes

4. **Role Modification**
   - Master agent can modify role definitions
   - Authorized agents can request changes to their own role (within bounds)
   - Changes apply to all agents holding that role
   - Audit trail captures all modifications

#### Master Agent Capabilities
The master agent is granted an `admin` role with:
- Unrestricted access to all tools, providers, workflows
- Can create/read/update/delete roles and functions
- Can grant/revoke any role assignment
- Can approve escalation requests
- Can audit all permission history
- Cannot be demoted or have role revoked (system constraint)

### 4.3 Permission Checking

#### Runtime Permission Enforcement

Before any agent action (tool execution, workflow trigger, provider communication), the system checks:

```
PERMISSION_CHECK_FLOW:
  1. Get agent's role assignments (current + non-expired escalations)
  2. Aggregate all role permissions
  3. Check if requested resource is in allowed list
  4. If denied or not allowed, raise PermissionDeniedError
  5. Log permission check result to audit trail
  6. Execute action if permitted
```

#### Permission Resolution

When multiple roles are assigned:
- **Allow Override:** If ANY role allows resource → allowed (union)
- **Deny Override:** Explicit denials supersede allows (blacklist priority)
- **Escalation Stacking:** Temporary escalation adds to base role permissions

### 4.4 Scope Binding

Roles can be scoped to specific functions:

```typescript
// Agent A is a "manager" in marketing function
{
  agentId: "agent-a",
  roleId: "manager",
  functionId: "marketing"  // Only applies to marketing function
}

// Agent A is a "worker" in operations function
{
  agentId: "agent-a",
  roleId: "worker",
  functionId: "operations"  // Only applies to operations function
}
```

This allows agents to have different capabilities across different organizational domains.

---

## 5. Detailed Design

### 5.1 Database Schema

#### `forge_roles`
```sql
CREATE TABLE forge_roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  tool_access_allowed TEXT,    -- JSON array of tool IDs
  tool_access_denied TEXT,     -- JSON array of tool IDs
  provider_access_allowed TEXT,
  provider_access_denied TEXT,
  workflow_access_allowed TEXT,
  workflow_access_denied TEXT,
  permissions_json TEXT,       -- JSON: canModifyOwnRole, isAdmin, etc.
  escalation_path_role_id TEXT,
  escalation_max_duration_ms INTEGER,
  metadata TEXT,               -- JSON custom attributes
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

#### `forge_functions`
```sql
CREATE TABLE forge_functions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  parent_function_id TEXT,     -- Support hierarchy
  metadata TEXT,               -- JSON custom attributes
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (parent_function_id) REFERENCES forge_functions(id)
);
```

#### `forge_role_function_mapping`
```sql
CREATE TABLE forge_role_function_mapping (
  id TEXT PRIMARY KEY,
  role_id TEXT NOT NULL,
  function_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (role_id) REFERENCES forge_roles(id),
  FOREIGN KEY (function_id) REFERENCES forge_functions(id),
  UNIQUE(role_id, function_id)
);
```

#### `forge_agent_role_assignments`
```sql
CREATE TABLE forge_agent_role_assignments (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  function_id TEXT,            -- Optional scope binding
  granted_at TEXT NOT NULL,
  granted_by TEXT NOT NULL,    -- Agent ID who granted
  expires_at TEXT,             -- NULL = permanent, set = temporary/escalation
  metadata TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (role_id) REFERENCES forge_roles(id)
);
```

#### `forge_role_audit_log`
```sql
CREATE TABLE forge_role_audit_log (
  id TEXT PRIMARY KEY,
  resource_type TEXT NOT NULL, -- 'role' | 'function' | 'assignment'
  resource_id TEXT NOT NULL,
  action TEXT NOT NULL,        -- 'created' | 'modified' | 'deleted' | 'granted' | 'revoked'
  actor_id TEXT NOT NULL,      -- Agent ID who performed action
  old_value TEXT,              -- JSON: previous state (if modification)
  new_value TEXT,              -- JSON: new state
  reason TEXT,                 -- Why action was taken
  created_at TEXT NOT NULL
);
```

#### `forge_permission_checks`
```sql
CREATE TABLE forge_permission_checks (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  resource_type TEXT NOT NULL, -- 'tool' | 'provider' | 'workflow'
  resource_id TEXT NOT NULL,
  allowed BOOLEAN NOT NULL,
  timestamp TEXT NOT NULL
);
```

### 5.2 API Reference

#### Role Management

```typescript
// List all roles
listRoles(): Promise<Role[]>

// Get role by ID
getRole(roleId: string): Promise<Role>

// Create role
createRole(input: {
  id: string
  name: string
  description: string
  functionIds: string[]
  toolAccess: { allowed: string[], denied: string[] }
  providerAccess: { allowed: string[], denied: string[] }
  workflowAccess: { allowed: string[], denied: string[] }
  permissions: RolePermissions
  escalationPath?: { roleId: string, maxDurationMs?: number }
  metadata?: Record<string, unknown>
}): Promise<Role>

// Update role (master agent only)
updateRole(roleId: string, updates: Partial<Role>): Promise<Role>

// Delete role (master agent only)
deleteRole(roleId: string): Promise<void>
```

#### Function Management

```typescript
// List all functions
listFunctions(): Promise<Function[]>

// Get function by ID
getFunction(functionId: string): Promise<Function>

// Create function
createFunction(input: {
  id: string
  name: string
  description: string
  parentFunctionId?: string
  metadata?: Record<string, unknown>
}): Promise<Function>

// Update function
updateFunction(functionId: string, updates: Partial<Function>): Promise<Function>

// Delete function
deleteFunction(functionId: string): Promise<void>
```

#### Agent Role Assignment

```typescript
// Get agent's current role assignments
getAgentRoles(agentId: string): Promise<AgentRoleAssignment[]>

// Assign role to agent (master agent or authorized agent)
assignRoleToAgent(input: {
  agentId: string
  roleId: string
  functionId?: string
  grantedBy: string         // Calling agent ID
  reason?: string
}): Promise<AgentRoleAssignment>

// Revoke role from agent
revokeRoleFromAgent(input: {
  agentId: string
  roleId: string
  functionId?: string
  revokedBy: string
  reason?: string
}): Promise<void>

// Request temporary escalation
requestEscalation(input: {
  agentId: string
  desiredRoleId: string
  reason: string
  requestedDurationMs: number
}): Promise<EscalationRequest>

// Approve/deny escalation (authorized agent)
handleEscalationRequest(input: {
  requestId: string
  approved: boolean
  actualDurationMs?: number
  reason?: string
}): Promise<AgentRoleAssignment | void>
```

#### Permission Checking

```typescript
// Check if agent can access resource
canAgentAccess(input: {
  agentId: string
  resourceType: 'tool' | 'provider' | 'workflow'
  resourceId: string
}): Promise<boolean>

// Get all accessible resources for agent
getAgentAccessibleResources(input: {
  agentId: string
  resourceType: 'tool' | 'provider' | 'workflow'
}): Promise<string[]>

// Get all agents with access to resource
getAgentsWithAccess(input: {
  resourceType: 'tool' | 'provider' | 'workflow'
  resourceId: string
}): Promise<AgentRoleAssignment[]>
```

#### Audit & Monitoring

```typescript
// Get audit log for resource
getAuditLog(input: {
  resourceType?: 'role' | 'function' | 'assignment'
  resourceId?: string
  action?: string
  actorId?: string
  startDate?: string
  endDate?: string
  limit: number
}): Promise<AuditLogEntry[]>

// Get permission check history
getPermissionCheckHistory(input: {
  agentId?: string
  resourceType?: string
  allowed?: boolean
  startDate?: string
  endDate?: string
  limit: number
}): Promise<PermissionCheck[]>
```

### 5.3 Integration Points

#### Integration with Existing Agent System

1. **Agent Specification** (`docs/system/agent-specification-mastra.md`)
   - Agents maintain their core identity/configuration unchanged
   - Role assignments stored separately in role/function tables
   - Permission checks injected into execution pipeline

2. **Agent Runtime** (`packages/mastra-engine/src/agent/`)
   - Add permission checking middleware in agent execution
   - Check permissions before tool execution, provider access, workflow trigger
   - Log all permission decisions to audit table

3. **Communication Module** (`docs/planning/communication-module.md`)
   - Provider access controlled via role `providerAccess`
   - Agent can only send messages via authorized providers
   - Audit log tracks provider usage by agent

4. **Memory System** (`docs/planning/memory-implementation-plan.md`)
   - Role/function context injected into working memory template
   - Agents aware of their role, function, and permission scope
   - Memory observations scoped to agent's authorized resources

### 5.4 Master Agent Initialization

```typescript
// Initialization sequence
async function initializeRoleAndFunctionSystem(agentId: string) {
  // 1. Create base functions
  const baseFunction = await createFunction({
    id: 'organization',
    name: 'Organization',
    description: 'Root organizational function'
  })

  // 2. Create base roles
  const adminRole = await createRole({
    id: 'admin',
    name: 'Administrator',
    description: 'System administrator with full permissions',
    functionIds: [baseFunction.id],
    toolAccess: { allowed: ['*'], denied: [] },
    providerAccess: { allowed: ['*'], denied: [] },
    workflowAccess: { allowed: ['*'], denied: [] },
    permissions: {
      canModifyOwnRole: false,
      canGrantPermissions: true,
      canRevokePermissions: true,
      canCreateAgents: true,
      canModifyAgents: true,
      canDeleteAgents: true,
      isAdmin: true
    }
  })

  // 3. Assign admin role to master agent
  await assignRoleToAgent({
    agentId,
    roleId: adminRole.id,
    grantedBy: agentId,  // Bootstrap: master grants to itself
    reason: 'Master agent initialization'
  })

  // 4. System is now ready
  return { adminRole, baseFunction }
}
```

---

## 6. Data Model and Schema

See **Section 5.1 Database Schema** for complete schema details.

**Key Design Principles:**

1. **Immutability of Core Records**
   - Once created, role/function IDs don't change
   - Updates stored as new records with updated_at timestamp
   - Full history available via audit log

2. **Scoped Permissions**
   - Roles optionally bound to functions
   - Same role can have different scope across agents
   - Enables cross-functional agents with role switching

3. **Audit Trail**
   - Every permission change logged with actor, timestamp, reason
   - Full state snapshots for modification actions
   - Compliance-ready for regulatory audits

4. **Cascade Behavior**
   - Deleting role → all assignments revoked (with audit entry)
   - Deleting function → removed from all role mappings
   - Agents maintain functionality, just lose associated permissions

---

## 7. User Stories & Use Cases

### Use Case 1: Marketing Agent Onboarding

**Scenario:** New marketing agent joins the platform.

```
Story:
- Master agent creates new agent "marketing-agent-1"
- Master agent assigns "marketing-specialist" role scoped to "marketing" function
- "marketing-specialist" role has:
  - Tools: content-generator, analytics-viewer, campaign-manager
  - Providers: email, slack (marketing channel)
  - Workflows: campaign-execution, content-publishing
- Agent can now execute marketing workflows with appropriate tools
- Agent cannot access sales CRM, finance tools, or ops workflows
```

### Use Case 2: Temporary Manager Escalation

**Scenario:** Marketing agent needs temporary manager permissions for urgent hiring decision.

```
Story:
- marketing-agent-1 (specialist) requests escalation to "marketing-manager" role
- Reason: "Need to approve new campaign budget"
- Master agent reviews request, approves for 4 hours
- System creates temporary AgentRoleAssignment with 4-hour expiration
- marketing-agent-1 gains manager permissions immediately
- After 4 hours, assignment auto-revokes, permissions disappear
- Audit log shows escalation request, approval, and auto-revocation
```

### Use Case 3: Permission Audit & Compliance

**Scenario:** Compliance team needs to audit who has access to sensitive data.

```
Story:
- Audit agent queries: "Get all agents with access to 'billing-system' tool"
- System returns: [agent-finance-1, agent-admin]
- Audit agent queries: "Get all permission changes for agent-finance-1 in last 30 days"
- System returns audit log with: grants, revokes, escalations, escalation expirations
- Audit agent exports audit log for compliance report
```

### Use Case 4: Function-Scoped Multi-Role Agent

**Scenario:** Agent has different roles across different business functions.

```
Story:
- Agent "general-coordinator" assigned:
  - "project-manager" role scoped to "product" function
  - "scheduler" role scoped to "operations" function
  - "communicator" role scoped to "sales" function
- When executing in product context, agent has PM capabilities
- When executing in operations context, agent has scheduler capabilities
- When executing in sales context, agent has communicator capabilities
- Each role grant audited separately
```

### Use Case 5: Role Evolution & Capability Growth

**Scenario:** Agent demonstrates strong performance, responsibilities expand.

```
Story:
- Agent starts as "worker" with basic tool access
- After 30 days, master agent upgrades to "specialist" role
- After 90 days, demonstrates leadership, upgraded to "team-lead"
- Each upgrade:
  - Grants new tools/providers/workflows
  - Revokes old role
  - Enables new capabilities (can delegate to others, approve escalations)
  - Full audit trail of progression
```

---

## 8. Technical Specifications

### 8.1 Implementation Locations

#### Core Role/Function System
- **Location:** `packages/mastra-engine/src/agent/roles/`
- **Files to Create:**
  - `types.ts` — Role, Function, AgentRoleAssignment interfaces
  - `manager.ts` — RoleManager class (CRUD operations)
  - `checker.ts` — PermissionChecker class (permission validation)
  - `initializer.ts` — Master agent initialization sequence
  - `store.ts` — Database operations (queries, inserts, updates, deletes)

#### Integration Points
- **Agent Runtime:** `packages/mastra-engine/src/agent/runtime.ts`
  - Add permission checking middleware before tool/workflow execution

- **Agent Creation:** `packages/mastra-engine/src/create-forge-agent.ts`
  - Initialize role system during agent creation
  - Inject permission checker into execution pipeline

- **Working Memory:** `packages/mastra-engine/src/agent/memory/memory.ts`
  - Add agent's role, function, and permission scope to working memory

- **Audit System:** New audit logging subsystem
  - Log all permission decisions, role changes, escalations

### 8.2 Performance Considerations

1. **Permission Check Latency**
   - In-memory role cache (invalidated on updates)
   - Permission check: < 10ms target
   - Batch permission checks supported for multi-resource operations

2. **Role Assignment Lookup**
   - Query by agentId (indexed)
   - Cache agent's active role assignments
   - Update cache on assignment/revocation

3. **Audit Log Growth**
   - Expected: 100-1000 entries per active agent per month
   - Partition by date range for efficient queries
   - Cleanup policy: Archive logs > 90 days (configurable)

4. **Escalation Expiration**
   - Cron job runs every minute
   - Auto-revokes expired escalations
   - Updates audit log with auto-expiration reason

### 8.3 Error Handling

```typescript
// Permission denied error
class PermissionDeniedError extends Error {
  agentId: string
  resourceType: string
  resourceId: string
  requiredRole?: string
}

// Invalid role error
class InvalidRoleError extends Error {
  roleId: string
  reason: string
}

// Escalation rejected error
class EscalationRejectedError extends Error {
  requestId: string
  reason: string
}
```

---

## 9. Rollout & Implementation Strategy

### Phase 1: Foundation (Week 1-2)
- Create database schema (roles, functions, assignments, audit)
- Implement Role and Function managers (CRUD APIs)
- Implement master agent initialization
- Unit tests for all schema operations

### Phase 2: Runtime Integration (Week 3-4)
- Implement PermissionChecker
- Integrate permission checks into agent execution pipeline
- Implement tool/provider/workflow access control
- Integration tests for permission enforcement

### Phase 3: Escalation & Delegation (Week 5-6)
- Implement escalation request/approval workflow
- Add escalation expiration logic
- Implement agent-to-agent role grants (if authorized)
- Test escalation expiration and auto-revocation

### Phase 4: Audit & Monitoring (Week 7-8)
- Implement comprehensive audit logging
- Build audit query APIs
- Create audit log cleanup/archival policies
- Compliance testing

### Phase 5: Documentation & Testing (Week 9-10)
- Write agent-facing documentation
- Create role/function templates for common scenarios
- Run comprehensive security testing
- Performance benchmarking and optimization

### Phase 6: Deployment & Operations (Week 11-12)
- Canary deployment to staging environment
- Monitor audit log, permission decisions, performance metrics
- Address issues, iterate
- Full production rollout

---

## 10. Risk Assessment & Mitigation

| Risk | Probability | Impact | Mitigation |
| --- | --- | --- | --- |
| **Master agent compromise** | Low | Critical | Master agent cannot have role revoked (system constraint); multi-signature approval for master agent action changes |
| **Permission bypass via timing** | Low | High | Atomic permission checks; permission cache invalidation on role changes |
| **Escalation abuse** | Medium | Medium | Audit trail visible to all; escalation approvers monitored; auto-revocation enforced |
| **Audit log tampering** | Low | Critical | Append-only audit table; cryptographic hashing of audit entries; external audit export |
| **Performance degradation** | Medium | Medium | Permission check caching; indexed database queries; batch permission validation |
| **Database corruption on cascade delete** | Low | High | Transactional deletes; rollback on failure; integrity checks in tests |

---

## 11. Success Criteria & Testing Strategy

### Functional Testing
- [ ] Master agent can initialize role/function system
- [ ] Roles can be created, read, updated, deleted
- [ ] Functions can be created with hierarchy support
- [ ] Agents can be assigned/revoked roles
- [ ] Permission checks enforce tool/provider/workflow access
- [ ] Escalation requests can be approved/denied with expiration
- [ ] Audit log captures all permission changes
- [ ] Role deletion cascades properly to assignments

### Performance Testing
- [ ] Permission check < 10ms latency (p99)
- [ ] Role lookup < 5ms latency (p99)
- [ ] Master agent initialization < 2 seconds
- [ ] Audit log queries handle 100k+ entries efficiently

### Security Testing
- [ ] Agent cannot escalate without authorization
- [ ] Agent cannot revoke roles without authorization
- [ ] Agent cannot modify roles without authorization
- [ ] Expired escalations automatically revoked
- [ ] Audit log immutable and tamper-evident

### Integration Testing
- [ ] Permission checks integrated with tool execution
- [ ] Permission checks integrated with provider access
- [ ] Permission checks integrated with workflow triggers
- [ ] Role context injected into working memory
- [ ] Communication module respects provider access roles

---

## 12. Open Questions & Decisions

1. **Wildcard Resource Access**
   - Should roles support `"*"` for "all tools" or require explicit lists?
   - **Decision Pending:** Explicit lists preferred for security audit; wildcard for admin roles only

2. **Role Inheritance Depth**
   - Should roles support multi-level inheritance?
   - **Decision Pending:** Start with single-level; revisit if complexity demands it

3. **Escalation Auto-Approval**
   - Should escalations auto-approve for brief durations (< 1 hour)?
   - **Decision Pending:** Require explicit approval for all escalations initially

4. **Cross-Organization Delegation**
   - Should roles be organization-scoped or global?
   - **Decision Pending:** Start global; add org scoping in future iteration

5. **Self-Service Role Changes**
   - Which role changes should agents be able to request without master approval?
   - **Decision Pending:** Only escalation requests; role changes require master approval

---

## 13. Appendices

### A. Glossary

| Term | Definition |
| --- | --- |
| **Agent** | Autonomous entity with identity, instructions, tools, and role assignments |
| **Role** | Set of permissions defining what tools, providers, workflows an agent can access |
| **Function** | Operational domain or business unit (Marketing, Sales, Operations, etc.) |
| **Master Agent** | Designated agent with admin role; initializes system and manages permission delegation |
| **Role Assignment** | Binding of agent to role, optionally scoped to function, with optional expiration |
| **Escalation** | Temporary elevation to higher-privilege role with auto-expiration |
| **Permission** | Ability to access a specific resource (tool, provider, workflow) |
| **Audit Trail** | Immutable log of all role/permission changes with actor, timestamp, reason |
| **Scope Binding** | Optional restriction of role to specific function or context |

### B. Sample Role Definitions

#### Admin Role
```typescript
{
  id: "admin",
  name: "Administrator",
  description: "System administrator with full permissions",
  toolAccess: { allowed: ["*"], denied: [] },
  providerAccess: { allowed: ["*"], denied: [] },
  workflowAccess: { allowed: ["*"], denied: [] },
  permissions: {
    canModifyOwnRole: false,
    canGrantPermissions: true,
    canRevokePermissions: true,
    canCreateAgents: true,
    canModifyAgents: true,
    canDeleteAgents: true,
    isAdmin: true
  }
}
```

#### Marketing Specialist Role
```typescript
{
  id: "marketing-specialist",
  name: "Marketing Specialist",
  description: "Executes marketing campaigns and content",
  functionIds: ["marketing"],
  toolAccess: {
    allowed: ["content-generator", "analytics-viewer", "campaign-manager"],
    denied: []
  },
  providerAccess: {
    allowed: ["email", "slack-marketing"],
    denied: []
  },
  workflowAccess: {
    allowed: ["campaign-execution", "content-publishing", "social-posting"],
    denied: []
  },
  permissions: {
    canModifyOwnRole: false,
    canGrantPermissions: false,
    canRevokePermissions: false,
    canCreateAgents: false,
    canModifyAgents: false,
    canDeleteAgents: false,
    isAdmin: false
  }
}
```

#### Sales Manager Role
```typescript
{
  id: "sales-manager",
  name: "Sales Manager",
  description: "Manages sales team and pipeline",
  functionIds: ["sales"],
  toolAccess: {
    allowed: ["crm", "analytics-viewer", "email", "proposal-generator"],
    denied: []
  },
  providerAccess: {
    allowed: ["email", "slack-sales"],
    denied: ["billing-system"]
  },
  workflowAccess: {
    allowed: ["deal-management", "forecast-generation", "team-reporting"],
    denied: []
  },
  permissions: {
    canModifyOwnRole: false,
    canGrantPermissions: true,  // Can grant to team members
    canRevokePermissions: true,
    canCreateAgents: true,       // Can onboard new sales agents
    canModifyAgents: true,       // Can modify team members' roles
    canDeleteAgents: false,      // Cannot delete (master only)
    isAdmin: false
  },
  escalationPath: {
    roleId: "admin",
    maxDurationMs: 3600000  // Max 1 hour escalation to admin
  }
}
```

### C. Escalation Request Flow

```
Agent requests escalation:
  → System validates request is in allowed path
  → Creates EscalationRequest record
  → Notifies escalation approver
  → Approver reviews request
  ├─ APPROVED:
  │  → Creates temporary AgentRoleAssignment with expiration
  │  → Agent immediately gains elevated permissions
  │  → Logs approval to audit trail
  │
  └─ DENIED:
     → Logs denial to audit trail
     → Notifies requesting agent
     → Request closed

Auto-expiration cron job (every minute):
  → Finds expired escalations
  → Revokes assignments
  → Logs auto-expiration to audit trail
```

### D. Database Indexing Strategy

```sql
-- Role queries
CREATE INDEX idx_roles_id ON forge_roles(id);
CREATE INDEX idx_roles_created_at ON forge_roles(created_at);

-- Function queries
CREATE INDEX idx_functions_id ON forge_functions(id);
CREATE INDEX idx_functions_parent ON forge_functions(parent_function_id);

-- Agent role lookup (critical path)
CREATE INDEX idx_agent_roles_agent_id ON forge_agent_role_assignments(agent_id);
CREATE INDEX idx_agent_roles_agent_role ON forge_agent_role_assignments(agent_id, role_id);
CREATE INDEX idx_agent_roles_expires ON forge_agent_role_assignments(expires_at);

-- Audit queries
CREATE INDEX idx_audit_resource ON forge_role_audit_log(resource_type, resource_id);
CREATE INDEX idx_audit_actor ON forge_role_audit_log(actor_id);
CREATE INDEX idx_audit_timestamp ON forge_role_audit_log(created_at);
```

### E. Future Enhancements

1. **Role Templates Library**
   - Pre-built role sets for common industries (SaaS, E-commerce, Agency)
   - Community-contributed templates
   - Template versioning and inheritance

2. **Dynamic Role Conditions**
   - Time-based roles (e.g., "can only access during business hours")
   - Context-based roles (e.g., "can access tool A only with approval from tool B")
   - ML-powered anomaly detection for permission misuse

3. **Cross-Org Permission Delegation**
   - Allow agents from different organizations to collaborate safely
   - Org-level role hierarchies
   - Cross-org escalation approval chains

4. **Role Analytics Dashboard**
   - Visualization of permission distribution
   - Unused role/tool detection
   - Permission usage trends over time
   - Compliance reporting

5. **Advanced Audit Features**
   - Blockchain-based audit trail (immutability guarantee)
   - Real-time audit log streaming
   - ML-powered audit anomaly detection
   - Custom audit policies per organization

---

**Document End**

---

## Change History

| Version | Date | Author | Changes |
| --- | --- | --- | --- |
| 1.0 | 2026-03-15 | Platform Team | Initial PRD - Complete structure with 13 sections |

