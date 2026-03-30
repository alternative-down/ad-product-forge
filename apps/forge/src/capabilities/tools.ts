import { createTool, type Tool } from '@mastra/core/tools';
import { z } from 'zod';

import type { Database } from '../database/index';
import { forgeCustomToolIds, forgeWorkflowIds, hasToolPermission } from './catalog';
import { createCapabilityStore } from './store';
import type { AgentLoaderConfig } from '../agents/agent-loader';
import { changeAgentFunction, reloadAgentsForFunction, reloadAgentsForRole } from './runtime';
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
  const tools: Record<string, unknown> = {};

  if (hasToolPermission(allowedToolIds, 'list_agent_functions')) {
    tools.list_agent_functions = createTool({
      id: 'list_agent_functions',
      description: 'View all internal agent functions available in the system. Functions define what an agent can do and are assigned to agents through roles.',
      inputSchema: z.object({}),
      execute: async () => {
        forgeDebug('tools:capabilities', 'list_agent_functions called');
        const result = await capabilities.listFunctions();
        forgeDebug('tools:capabilities', 'list_agent_functions result', { 
          count: result.length, 
          functions: result.map(f => ({ functionId: f.functionId, name: f.name, description: f.description, roleIds: f.roleIds })) 
        });
        return result;
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'create_agent_function')) {
    tools.create_agent_function = createTool({
      id: 'create_agent_function',
      description: 'Create a new internal agent function with a custom name and description.',
      inputSchema: z.object({
        functionId: z.string().nullish().describe('Function ID (optional, auto-generated if omitted).'),
        name: z.string().min(1).describe('Function name.'),
        description: z.string().nullish().describe('Function description.'),
      }),
      execute: async (input) => {
        forgeDebug('tools:capabilities', 'create_agent_function called', { input });
        const result = capabilities.createFunction({
          name: input.name,
          description: input.description ?? undefined,
        });
        forgeDebug('tools:capabilities', 'create_agent_function result', { result });
        return result;
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'update_agent_function')) {
    tools.update_agent_function = createTool({
      id: 'update_agent_function',
      description: 'Update an existing agent function\'s name or description.',
      inputSchema: z.object({
        functionId: z.string().describe('Function ID to update.'),
        name: z.string().nullish().describe('New function name.'),
        description: z.string().nullish().describe('New function description.'),
      }),
      execute: async (input) => {
        forgeDebug('tools:capabilities', 'update_agent_function called', { input });
        if (!input.name && input.description === undefined) {
          forgeDebug('tools:capabilities', 'update_agent_function validation failed', { reason: 'no fields provided' });
          return { valid: false, error: 'At least one field besides functionId must be provided', hint: 'Provide at least one of: name or description.' };
        }
        try {
          const result = await capabilities.updateFunction({
            functionId: input.functionId,
            name: input.name,
            description: input.description,
          });
          await reloadAgentsForFunction(db, loaderConfig, input.functionId);
          forgeDebug('tools:capabilities', 'update_agent_function success', { result });
          return { valid: true, ...result };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          forgeDebug('tools:capabilities', 'update_agent_function error', { error: message });
          return { valid: false, error: message, hint: 'Use list_agent_functions to find valid function IDs.' };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'delete_agent_function')) {
    tools.delete_agent_function = createTool({
      id: 'delete_agent_function',
      description: 'Delete an unused agent function.',
      inputSchema: z.object({
        functionId: z.string().describe('Function ID to delete.'),
      }),
      execute: async (input) => {
        forgeDebug('tools:capabilities', 'delete_agent_function called', { functionId: input.functionId });
        try {
          const result = await capabilities.deleteFunction(input.functionId);
          await reloadAgentsForFunction(db, loaderConfig, input.functionId);
          forgeDebug('tools:capabilities', 'delete_agent_function success', { result });
          return { valid: true, ...result };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          forgeDebug('tools:capabilities', 'delete_agent_function error', { error: message });
          return { valid: false, error: message, hint: 'Use list_agent_functions to find valid function IDs. Ensure no agents are using this function before deleting.' };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_agent_roles')) {
    tools.list_agent_roles = createTool({
      id: 'list_agent_roles',
      description: 'View all roles configured in the system. Roles bundle functions and tool permissions to define an agent\'s capabilities.',
      inputSchema: z.object({}),
      execute: async () => {
        forgeDebug('tools:capabilities', 'list_agent_roles called');
        const result = await capabilities.listRoles();
        forgeDebug('tools:capabilities', 'list_agent_roles result', { 
          count: result.length, 
          roles: result.map(r => ({ roleId: r.roleId, name: r.name, description: r.description })) 
        });
        return result;
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'create_agent_role')) {
    tools.create_agent_role = createTool({
      id: 'create_agent_role',
      description: 'Create a new role with a custom name and description.',
      inputSchema: z.object({
        roleId: z.string().nullish().describe('Role ID (optional, auto-generated if omitted).'),
        name: z.string().min(1).describe('Role name.'),
        description: z.string().nullish().describe('Role description.'),
      }),
      execute: async (input) => {
        forgeDebug('tools:capabilities', 'create_agent_role called', { input });
        const result = capabilities.createRole({
          name: input.name,
          description: input.description ?? undefined,
        });
        forgeDebug('tools:capabilities', 'create_agent_role result', { result });
        return result;
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'update_agent_role')) {
    tools.update_agent_role = createTool({
      id: 'update_agent_role',
      description: 'Update an existing role\'s name or description.',
      inputSchema: z.object({
        roleId: z.string().describe('Role ID to update.'),
        name: z.string().nullish().describe('New role name.'),
        description: z.string().nullish().describe('New role description.'),
      }),
      execute: async (input) => {
        forgeDebug('tools:capabilities', 'update_agent_role called', { input });
        if (!input.name && input.description === undefined) {
          forgeDebug('tools:capabilities', 'update_agent_role validation failed', { reason: 'no fields provided' });
          return { valid: false, error: 'At least one field besides roleId must be provided', hint: 'Provide at least one of: name or description.' };
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
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          forgeDebug('tools:capabilities', 'update_agent_role error', { error: message });
          return { valid: false, error: message, hint: 'Use list_agent_roles to find valid role IDs.' };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'delete_agent_role')) {
    tools.delete_agent_role = createTool({
      id: 'delete_agent_role',
      description: 'Delete an unused role.',
      inputSchema: z.object({
        roleId: z.string().describe('Role ID to delete.'),
      }),
      execute: async (input) => {
        forgeDebug('tools:capabilities', 'delete_agent_role called', { roleId: input.roleId });
        try {
          const result = await capabilities.deleteRole(input.roleId);
          await reloadAgentsForRole(db, loaderConfig, input.roleId);
          forgeDebug('tools:capabilities', 'delete_agent_role success', { result });
          return { valid: true, ...result };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          forgeDebug('tools:capabilities', 'delete_agent_role error', { error: message });
          return { valid: false, error: message, hint: 'Use list_agent_roles to find valid role IDs. Ensure no functions are using this role before deleting.' };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'assign_role_to_function')) {
    tools.assign_role_to_function = createTool({
      id: 'assign_role_to_function',
      description: 'Associate a role with a function. Multiple roles can be assigned to the same function to combine different capability sets.',
      inputSchema: z.object({
        functionId: z.string().min(1).describe('Function ID to assign the role to.'),
        roleId: z.string().min(1).describe('Role ID to assign.'),
      }),
      execute: async (input) => {
        forgeDebug('tools:capabilities', 'assign_role_to_function called', { input });
        try {
          const result = await capabilities.addRoleToFunction(input);
          await reloadAgentsForFunction(db, loaderConfig, input.functionId);
          forgeDebug('tools:capabilities', 'assign_role_to_function success', { result });
          return { valid: true, ...result };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          forgeDebug('tools:capabilities', 'assign_role_to_function error', { error: message });
          return { valid: false, error: message, hint: 'Use list_agent_functions and list_agent_roles to verify both IDs exist.' };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'change_agent_function')) {
    tools.change_agent_function = createTool({
      id: 'change_agent_function',
      description: 'Change another agent\'s assigned function. The target agent will receive a notification and wake up with the new function context.',
      inputSchema: z.object({
        agentId: z.string().min(1).describe('Target agent ID to change function.'),
        functionId: z.string().min(1).describe('New function ID to assign.'),
      }),
      execute: async (input) => {
        forgeDebug('tools:capabilities', 'change_agent_function called', { input });
        try {
          const result = await changeAgentFunction({
            db,
            loaderConfig,
            actorAgentId: currentAgentId,
            targetAgentId: input.agentId,
            functionId: input.functionId,
          });
          forgeDebug('tools:capabilities', 'change_agent_function success', { result });
          return { valid: true, ...result };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          forgeDebug('tools:capabilities', 'change_agent_function error', { error: message });
          return { valid: false, error: message, hint: 'Use list_agents and list_agent_functions to verify both IDs exist.' };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'change_own_function')) {
    tools.change_own_function = createTool({
      id: 'change_own_function',
      description: 'Switch your own assigned function to a different one. You will receive a notification and wake up with the new function\'s context and capabilities.',
      inputSchema: z.object({
        functionId: z.string().min(1).describe('Function ID to switch to.'),
      }),
      execute: async (input) => {
        forgeDebug('tools:capabilities', 'change_own_function called', { functionId: input.functionId });
        try {
          const result = await changeAgentFunction({
            db,
            loaderConfig,
            actorAgentId: currentAgentId,
            targetAgentId: currentAgentId,
            functionId: input.functionId,
          });
          forgeDebug('tools:capabilities', 'change_own_function success', { result });
          return { valid: true, ...result };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          forgeDebug('tools:capabilities', 'change_own_function error', { error: message });
          return { valid: false, error: message, hint: 'Use list_agent_functions to find valid function IDs.' };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_role_tool_permissions')) {
    tools.list_role_tool_permissions = createTool({
      id: 'list_role_tool_permissions',
      description: 'View which custom tool IDs are permitted for a specific role. Tool IDs define granular access to specific capabilities.',
      inputSchema: z.object({
        roleId: z.string().min(1),
      }),
      execute: async (input) => {
        forgeDebug('tools:capabilities', 'list_role_tool_permissions called', { roleId: input.roleId });
        const result = await capabilities.listRoleToolPermissions(input.roleId);
        forgeDebug('tools:capabilities', 'list_role_tool_permissions result', { 
          roleId: input.roleId,
          count: result.length, 
          permissions: result 
        });
        return result;
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'manage_role_tool_permissions')) {
    tools.manage_role_tool_permissions = createTool({
      id: 'manage_role_tool_permissions',
      description: 'Add or remove individual tool permissions for a role. Revoking prevents agents with that role from using the specified tool.',
      inputSchema: z.object({
        action: z.enum(['add', 'remove']).describe('Action to perform: add or remove permission.'),
        roleId: z.string().min(1).describe('Role ID to modify.'),
        toolId: toolIdSchema.describe('Tool ID to add or remove.'),
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
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          forgeDebug('tools:capabilities', 'manage_role_tool_permissions error', { error: message });
          return { valid: false, error: message, hint: 'Use list_agent_roles and list_available_capabilities to verify role ID and tool ID exist.' };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_role_workflow_permissions')) {
    tools.list_role_workflow_permissions = createTool({
      id: 'list_role_workflow_permissions',
      description: 'View which workflow IDs are permitted for a specific role. Workflow IDs control access to automated agent workflows.',
      inputSchema: z.object({
        roleId: z.string().min(1),
      }),
      execute: async (input) => {
        forgeDebug('tools:capabilities', 'list_role_workflow_permissions called', { roleId: input.roleId });
        const result = await capabilities.listRoleWorkflowPermissions(input.roleId);
        forgeDebug('tools:capabilities', 'list_role_workflow_permissions result', { count: result.length });
        return result;
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'manage_role_workflow_permissions')) {
    tools.manage_role_workflow_permissions = createTool({
      id: 'manage_role_workflow_permissions',
      description: 'Add or remove individual workflow permissions for a role. Revoking prevents agents with that role from triggering the specified workflow.',
      inputSchema: z.object({
        action: z.enum(['add', 'remove']).describe('Action to perform: add or remove permission.'),
        roleId: z.string().min(1).describe('Role ID to modify.'),
        workflowId: workflowIdSchema.describe('Workflow ID to add or remove.'),
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
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          forgeDebug('tools:capabilities', 'manage_role_workflow_permissions error', { error: message });
          return { valid: false, error: message, hint: 'Use list_agent_roles and list_available_capabilities to verify role ID and workflow ID exist.' };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_available_capabilities')) {
    tools.list_available_capabilities = createTool({
      id: 'list_available_capabilities',
      description: 'Get a complete list of all available custom tool IDs and workflow IDs that can be assigned to roles for permission management.',
      inputSchema: z.object({}),
      execute: async () => {
        forgeDebug('tools:capabilities', 'list_available_capabilities called');
        const result = {
          toolIds: forgeCustomToolIds,
          workflowIds: forgeWorkflowIds,
        };
        forgeDebug('tools:capabilities', 'list_available_capabilities result', { toolCount: result.toolIds.length, workflowCount: result.workflowIds.length });
        return result;
      },
    });
  }

  return tools as Record<string, Tool<unknown, unknown>>;
}
