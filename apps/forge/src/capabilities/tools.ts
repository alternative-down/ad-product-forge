import { createTool, type Tool } from '@mastra/core/tools';
import { z } from 'zod';

import type { Database } from '../database/index';
import { forgeCustomToolIds, forgeWorkflowIds, hasToolPermission } from './catalog';
import { createCapabilityStore } from './store';
import type { AgentLoaderConfig } from '../agents/agent-loader';
import { changeAgentRole, reloadAgentsForRole } from './runtime';
import { forgeDebug } from '@mastra-engine/core';

const toolIdSchema = z.enum(forgeCustomToolIds);
const workflowIdSchema = z.enum(forgeWorkflowIds);

export function createCapabilityTools(
  db: Database,
  loaderConfig: AgentLoaderConfig,
  currentAgentId: string,
  allowedToolIds?: Set<string> | null,
) {
  const capabilities = createCapabilityStore(db);
  const tools: Record<string, Tool<unknown, unknown>> = {};

  if (hasToolPermission(allowedToolIds, 'list_agent_roles')) {
    tools.list_agent_roles = createTool({
      id: 'list_agent_roles',
      description: 'List the roles available in the system. Use this when you need a roleId to inspect, update, assign to an agent, or manage permissions.',
      inputSchema: z.object({}),
      execute: async () => {
        forgeDebug('tools:capabilities', 'list_agent_roles called');

        try {
          const result = await capabilities.listRoles();
          forgeDebug('tools:capabilities', 'list_agent_roles result', {
            count: result.length,
            roles: result.map((role) => ({
              roleId: role.roleId,
              name: role.name,
            })),
          });
          return result;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          forgeDebug('tools:capabilities', 'list_agent_roles error', { error: message });
          return {
            valid: false,
            error: message,
            hint: 'Try again in a moment. If the problem persists, verify the capability store is available.',
          };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'create_agent_role')) {
    tools.create_agent_role = createTool({
      id: 'create_agent_role',
      description: 'Create a new role. Roles are the unit that grant tools and workflows, and they are assigned directly to agents.',
      inputSchema: z.object({
        name: z.string().min(1).describe('Name of the new role.'),
        description: z.string().nullish().describe('Optional description of what this role is responsible for.'),
      }),
      execute: async (input) => {
        forgeDebug('tools:capabilities', 'create_agent_role called', { input });

        try {
          const result = await capabilities.createRole({
            name: input.name,
            description: input.description ?? undefined,
          });
          forgeDebug('tools:capabilities', 'create_agent_role result', { result });
          return { valid: true, ...result };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          forgeDebug('tools:capabilities', 'create_agent_role error', { error: message });
          return {
            valid: false,
            error: message,
            hint: 'Use a unique role name and try again.',
          };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'update_agent_role')) {
    tools.update_agent_role = createTool({
      id: 'update_agent_role',
      description: 'Update the name or description of an existing role.',
      inputSchema: z.object({
        roleId: z.string().min(1).describe('The roleId you want to update.'),
        name: z.string().nullish().describe('New name for the role.'),
        description: z.string().nullish().describe('New description for the role.'),
      }),
      execute: async (input) => {
        forgeDebug('tools:capabilities', 'update_agent_role called', { input });

        if (!input.name && input.description === undefined) {
          return {
            valid: false,
            error: 'At least one field besides roleId must be provided.',
            hint: 'Provide a new name, a new description, or both.',
          };
        }

        try {
          const result = await capabilities.updateRole({
            roleId: input.roleId,
            name: input.name,
            description: input.description,
          });
          await reloadAgentsForRole(db, loaderConfig, input.roleId);
          forgeDebug('tools:capabilities', 'update_agent_role success', { result });
          return { valid: true, ...result };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          forgeDebug('tools:capabilities', 'update_agent_role error', { error: message });
          return {
            valid: false,
            error: message,
            hint: 'Use list_agent_roles to confirm the roleId.',
          };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'delete_agent_role')) {
    tools.delete_agent_role = createTool({
      id: 'delete_agent_role',
      description: 'Delete a role that is no longer needed. This only works when no agents are currently assigned to that role.',
      inputSchema: z.object({
        roleId: z.string().min(1).describe('The roleId you want to delete.'),
      }),
      execute: async (input) => {
        forgeDebug('tools:capabilities', 'delete_agent_role called', { roleId: input.roleId });

        try {
          const result = await capabilities.deleteRole(input.roleId);
          await reloadAgentsForRole(db, loaderConfig, input.roleId);
          forgeDebug('tools:capabilities', 'delete_agent_role success', { result });
          return { valid: true, ...result };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          forgeDebug('tools:capabilities', 'delete_agent_role error', { error: message });
          return {
            valid: false,
            error: message,
            hint: 'Use list_agent_roles to confirm the roleId. If the role is assigned, move those agents to another role first.',
          };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'change_agent_role')) {
    tools.change_agent_role = createTool({
      id: 'change_agent_role',
      description: 'Change the role assigned to another agent.',
      inputSchema: z.object({
        agentId: z.string().min(1).describe('The agentId of the agent whose role should change.'),
        roleId: z.string().min(1).describe('The new roleId that should be assigned to that agent.'),
      }),
      execute: async (input) => {
        forgeDebug('tools:capabilities', 'change_agent_role called', { input });

        try {
          const result = await changeAgentRole({
            db,
            loaderConfig,
            actorAgentId: currentAgentId,
            targetAgentId: input.agentId,
            roleId: input.roleId,
          });
          forgeDebug('tools:capabilities', 'change_agent_role success', { result });
          return { valid: true, ...result };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          forgeDebug('tools:capabilities', 'change_agent_role error', { error: message });
          return {
            valid: false,
            error: message,
            hint: 'Use list_agents and list_agent_roles to verify the agentId and roleId.',
          };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'change_own_role')) {
    tools.change_own_role = createTool({
      id: 'change_own_role',
      description: 'Switch yourself to another role.',
      inputSchema: z.object({
        roleId: z.string().min(1).describe('The roleId you want to switch to.'),
      }),
      execute: async (input) => {
        forgeDebug('tools:capabilities', 'change_own_role called', { roleId: input.roleId });

        try {
          const result = await changeAgentRole({
            db,
            loaderConfig,
            actorAgentId: currentAgentId,
            targetAgentId: currentAgentId,
            roleId: input.roleId,
          });
          forgeDebug('tools:capabilities', 'change_own_role success', { result });
          return { valid: true, ...result };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          forgeDebug('tools:capabilities', 'change_own_role error', { error: message });
          return {
            valid: false,
            error: message,
            hint: 'Use list_agent_roles to find a valid roleId.',
          };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_role_tool_permissions')) {
    tools.list_role_tool_permissions = createTool({
      id: 'list_role_tool_permissions',
      description: 'List which tools a role is allowed to use.',
      inputSchema: z.object({
        roleId: z.string().min(1).describe('The roleId you want to inspect.'),
      }),
      execute: async (input) => {
        forgeDebug('tools:capabilities', 'list_role_tool_permissions called', { roleId: input.roleId });

        try {
          return await capabilities.listRoleToolPermissions(input.roleId);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          forgeDebug('tools:capabilities', 'list_role_tool_permissions error', { error: message });
          return {
            valid: false,
            error: message,
            hint: 'Use list_agent_roles to confirm the roleId.',
          };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'manage_role_tool_permissions')) {
    tools.manage_role_tool_permissions = createTool({
      id: 'manage_role_tool_permissions',
      description: 'Add or remove one tool permission for a role.',
      inputSchema: z.object({
        action: z.enum(['add', 'remove']).describe('Choose add to grant the tool or remove to revoke it.'),
        roleId: z.string().min(1).describe('The roleId you want to change.'),
        toolId: toolIdSchema.describe('The toolId to grant or revoke.'),
      }),
      execute: async (input) => {
        forgeDebug('tools:capabilities', 'manage_role_tool_permissions called', { input });

        try {
          const result = input.action === 'add'
            ? await capabilities.addRoleToolPermission({ roleId: input.roleId, toolId: input.toolId })
            : await capabilities.removeRoleToolPermission({ roleId: input.roleId, toolId: input.toolId });
          await reloadAgentsForRole(db, loaderConfig, input.roleId);
          forgeDebug('tools:capabilities', 'manage_role_tool_permissions success', { result });
          return { valid: true, ...result };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          forgeDebug('tools:capabilities', 'manage_role_tool_permissions error', { error: message });
          return {
            valid: false,
            error: message,
            hint: 'Use list_agent_roles and list_available_capabilities to verify the roleId and toolId.',
          };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_role_workflow_permissions')) {
    tools.list_role_workflow_permissions = createTool({
      id: 'list_role_workflow_permissions',
      description: 'List which workflows a role is allowed to use.',
      inputSchema: z.object({
        roleId: z.string().min(1).describe('The roleId you want to inspect.'),
      }),
      execute: async (input) => {
        forgeDebug('tools:capabilities', 'list_role_workflow_permissions called', { roleId: input.roleId });

        try {
          return await capabilities.listRoleWorkflowPermissions(input.roleId);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          forgeDebug('tools:capabilities', 'list_role_workflow_permissions error', { error: message });
          return {
            valid: false,
            error: message,
            hint: 'Use list_agent_roles to confirm the roleId.',
          };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'manage_role_workflow_permissions')) {
    tools.manage_role_workflow_permissions = createTool({
      id: 'manage_role_workflow_permissions',
      description: 'Add or remove one workflow permission for a role.',
      inputSchema: z.object({
        action: z.enum(['add', 'remove']).describe('Choose add to grant the workflow or remove to revoke it.'),
        roleId: z.string().min(1).describe('The roleId you want to change.'),
        workflowId: workflowIdSchema.describe('The workflowId to grant or revoke.'),
      }),
      execute: async (input) => {
        forgeDebug('tools:capabilities', 'manage_role_workflow_permissions called', { input });

        try {
          const result = input.action === 'add'
            ? await capabilities.addRoleWorkflowPermission({ roleId: input.roleId, workflowId: input.workflowId })
            : await capabilities.removeRoleWorkflowPermission({ roleId: input.roleId, workflowId: input.workflowId });
          await reloadAgentsForRole(db, loaderConfig, input.roleId);
          forgeDebug('tools:capabilities', 'manage_role_workflow_permissions success', { result });
          return { valid: true, ...result };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          forgeDebug('tools:capabilities', 'manage_role_workflow_permissions error', { error: message });
          return {
            valid: false,
            error: message,
            hint: 'Use list_agent_roles and list_available_capabilities to verify the roleId and workflowId.',
          };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_available_capabilities')) {
    tools.list_available_capabilities = createTool({
      id: 'list_available_capabilities',
      description: 'List all toolIds and workflowIds that can be granted to a role.',
      inputSchema: z.object({}),
      execute: async () => ({
        toolIds: forgeCustomToolIds,
        workflowIds: forgeWorkflowIds,
      }),
    });
  }

  return tools;
}
