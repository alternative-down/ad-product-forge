# PRD-04: Role and Function Schema

**Status:** In Progress
**Last Updated:** 2026-03-15

> **Note:** Este é um projeto pessoal de desenvolvedor solo. Requisitos focam em funcionalidade, não robustez corporativa.

---

## 1. Executive Summary

The **Role and Function Schema** enables agents to have defined roles with specific permissions. This allows a master agent to initialize the system and manage permission grants/revokes for other agents through a simple delegation pattern.

**Key Value:**
- **Simple Control:** Define what each agent can access (Tools, Providers, Workflows)
- **Functional Grouping:** Group agents by operational function
- **Delegation:** Master agent grants permissions to other agents

---

## 2. Problem Statement

### Current State
Currently, agents in the Forge platform have flat capability structures. Tools, providers, and workflows are assigned without a structured framework that reflects:
- Agent functional roles (marketing agent, sales agent, operations agent, etc.)
- Organizational hierarchy and reporting structure
- Granular access controls to sensitive operations
- Clear permission boundaries and escalation paths

### Problems This Solves

1. **Lack of Organization Structure**
   - Agents cannot be grouped by role
   - No clear permissions for different agents

2. **Uncontrolled Permission Model**
   - All agents have access to all capabilities
   - No mechanism to restrict sensitive operations
   - No audit trail for changes

3. **Operational Risk**
   - Agents can access tools they shouldn't
   - No way to revoke permissions when needed

---

## 3. Goals and Success Metrics

### Primary Goals

1. **Implement Role System**
   - Define roles (Manager, Specialist, Worker, Admin)
   - Assign capabilities to roles

2. **Implement Function Classification**
   - Group agents by function (Marketing, Sales, Ops, etc.)
   - Use function as organizational context

3. **Enable Safe Delegation**
   - Master agent can grant/revoke permissions
   - Maintain audit trail

4. **Provide Permission Boundaries**
   - Define which tools, providers, workflows each role can access
   - Implement permission checks

### Success Metrics

| Metric | Target |
| --- | --- |
| **Role Assignment Coverage** | Agents have explicit role |
| **Permission Grant Works** | Master agent can assign roles |
| **Permission Checks Work** | Permission checks before tool access |
| **Audit Trail** | Permission changes logged |

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
  id: string
  agentId: string
  roleId: string
  functionId?: string
  grantedAt: string
  grantedBy: string
  metadata?: Record<string, unknown>
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
   - Master agent or authorized agents can grant roles
   - Creates AgentRoleAssignment records

2. **Permission Revocation**
   - Master agent can revoke roles
   - Removes agent access to role-based resources

3. **Role Modification**
   - Master agent can modify role definitions
   - Changes apply to all agents holding that role

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
  function_id TEXT,
  granted_at TEXT NOT NULL,
  granted_by TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (role_id) REFERENCES forge_roles(id)
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

## 9. Implementation Strategy

### Phase 1: Foundation
- Create database schema
- Implement Role and Function managers (CRUD APIs)
- Implement master agent initialization

### Phase 2: Runtime Integration
- Implement PermissionChecker
- Integrate permission checks into execution pipeline
- Implement access control

### Phase 3: Testing & Documentation
- Write tests and documentation
- Create role templates

---

## 10. Risk Assessment & Mitigation

| Risk | Mitigation |
| --- | --- |
| **Master agent compromise** | Master agent cannot have role revoked |
| **Permission bypass** | Atomic permission checks |
| **Performance degradation** | Permission caching |

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

## 12. Design Decisions

- Roles support wildcard `"*"` for admin roles only
- Start with single-level role hierarchy
- All escalations require explicit approval
- Roles are global (not organization-scoped)
- Role changes require master approval

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


### D. Database Indexing Strategy

```sql
-- Role queries
CREATE INDEX idx_roles_id ON forge_roles(id);

-- Function queries
CREATE INDEX idx_functions_id ON forge_functions(id);

-- Agent role lookup (critical path)
CREATE INDEX idx_agent_roles_agent_id ON forge_agent_role_assignments(agent_id);
CREATE INDEX idx_agent_roles_agent_role ON forge_agent_role_assignments(agent_id, role_id);
```

### E. Future Enhancements

1. **Dynamic Role Conditions** — Time-based or context-based roles
2. **Role Analytics** — View permission distribution and usage
3. **Advanced Audit Features** — Comprehensive audit trail visibility

---

**Document End**

---

## Change History

| Version | Date | Author | Changes |
| --- | --- | --- | --- |
| 1.0 | 2026-03-15 | Platform Team | Initial PRD - Complete structure with 13 sections |

