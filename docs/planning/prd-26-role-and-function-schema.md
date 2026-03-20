# PRD-26: Role and Function Capability Control

**Status:** Planning
**Data:** 2026-03-20

## Objective

Define the minimal role/function system used to control which **custom tools** and **workflows** each internal agent can use.

This PRD is intentionally narrow.
It is not a generic RBAC system.
It is a capability filter over the runtime surface that Forge already exposes.

## Scope

This PRD covers:
- role and function records
- permission records by `tool.id`
- permission records by `workflow.id`
- runtime filtering of custom tools
- runtime filtering of MCP tools
- runtime filtering of workflows
- management tools/workflows for roles and functions

This PRD does not cover:
- communication providers as permissions
- Mastra built-in injected tools as permissions
- resource-level ACLs
- per-repository or per-application permission rules
- field-level permission models

## Core Decisions

### 1. Permission target is literal id

Permissions are keyed by the literal runtime identifier:
- custom tool permission = `tool.id`
- workflow permission = `workflow.id`

There is no abstraction layer above that.
There is no category indirection.
The identifier itself is the capability contract.

### 2. Providers are not permissions

Providers are provisioned during hiring and load.
They are not granted or denied through the role system.

So the separation is:
- providers = what external capability the agent has configured
- permissions = which custom tools and workflows the agent can invoke

### 3. Mastra built-in tools stay free

Mastra tools automatically injected by the framework are not filtered by this system.

The permission layer only applies to:
- Forge custom tools
- MCP tools
- Forge workflows

Internal chat tools are also always free.
They stay outside the role filter because internal coordination is foundational to the runtime.

### 4. Function is organizational grouping

A function is an organizational grouping.
A role is the capability set.

For the first version:
- agent belongs to one function
- function points to one role
- role defines the allowed tools and workflows
- every agent must have `functionId`

This keeps the model linear.

## Data Model Direction

### functions
- `id`
- `name`
- `description`
- `createdAt`
- `updatedAt`

### roles
- `id`
- `name`
- `description`
- `createdAt`
- `updatedAt`

### function_roles
- `functionId`
- `roleId`

This keeps one active role per function in the first version.

### role_tool_permissions
- `roleId`
- `toolId`

### role_workflow_permissions
- `roleId`
- `workflowId`

### agents
Direction for the first version:
- add required `functionId`

The role is derived from the function.
There is no separate direct `roleId` assignment on the agent in v1.

## Runtime Enforcement

### Tool filtering

At runtime Forge already builds the custom tool map before it passes the map into `ToolSearchProcessor`.

The permission filter should happen exactly there:
1. Forge builds the full map of custom tools and MCP tools
2. Forge loads the role-derived allowed tool ids for the agent
3. Forge filters the map by `tool.id`
4. Forge passes only the filtered map into `ToolSearchProcessor`

Mastra built-in tools are not part of this filtered set.

### Workflow filtering

The same rule applies to workflows:
1. Forge builds the full workflow map
2. Forge loads the role-derived allowed workflow ids
3. Forge filters the workflow map by `workflow.id`
4. The agent runtime receives only the allowed workflows

### Provider behavior

Providers continue to be loaded from provisioning data.
They are not filtered by the permission system.

## Management Surface

The system should expose management capabilities for authorized agents.

Initial capability surface:
- create function
- list functions
- update function
- create role
- list roles
- update role
- assign role to function
- change own function
- change another agent function
- list role tool permissions
- add role tool permission
- remove role tool permission
- list role workflow permissions
- add role workflow permission
- remove role workflow permission
- assign function to agent

The same permission model applies to these management tools too.

## Technical Direction

### Runtime boundary

The correct runtime boundary is:
- resolve allowed tool ids first
- build only the allowed custom and MCP tools
- then give that set to `ToolSearchProcessor`

Not:
- build separate agent classes per role
- dynamically deny tool calls after exposure
- build every custom tool and discard most of them later
- mix provider provisioning with capability permissions

### Stability rule

Tool ids and workflow ids must be treated as stable internal contracts.
If one is renamed, the permission records must be migrated accordingly.

### MCP rule

MCP tools are treated the same way as Forge custom tools.
If a MCP tool is exposed to agents, it must also be filtered by its tool id before runtime exposure.

## Success Criteria

- [ ] functions exist as organizational grouping
- [ ] roles exist as capability sets
- [ ] tools are granted by literal `tool.id`
- [ ] workflows are granted by literal `workflow.id`
- [ ] providers stay outside the permission model
- [ ] Mastra built-in tools stay outside the permission filter
- [ ] runtime exposes only allowed custom tools and workflows
- [ ] authorized agents can manage roles/functions through management capabilities

## Notes

This PRD deliberately keeps the first version small.

The goal is not full RBAC.
The goal is simply to control:
- which custom tools the agent can use
- which workflows the agent can use

Everything else should be postponed until there is real pressure for a more complex model.

## Initial Seed Roles

The first migration seeds initial roles grouped by context:
- `finance`
- `github`
- `deployment`
- `scheduling`
- `capability-management`

These seeded roles are just the starting capability groups.
Functions can point to any one of them.
