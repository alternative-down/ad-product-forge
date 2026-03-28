import { createTool, type Tool } from '@mastra/core/tools';
import { z } from 'zod';

import type { Database } from '../database/index';
import { forgeCustomToolIds, forgeWorkflowIds, hasToolPermission } from './catalog';
import { createCapabilityStore } from './store';
import type { AgentLoaderConfig } from '../agents/agent-loader';
import { changeAgentFunction, reloadAgentsForFunction, reloadAgentsForRole } from './runtime';

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
      execute: async () => capabilities.listFunctions(),
    });
  }

  if (hasToolPermission(allowedToolIds, 'manage_agent_function')) {
    // Keep branch-specific validation outside the discriminated union.
    // In Zod v3, adding `.refine()` to one branch wraps it in ZodEffects and
    // breaks `z.discriminatedUnion('action', ...)` at schema creation time.
    const manageAgentFunctionSchema = z
      .discriminatedUnion('action', [
        z.object({
          action: z.literal('create'),
          functionId: z.string().min(1).nullish().describe('Function ID (optional, auto-generated if omitted).'),
          name: z.string().min(1).describe('Function name.'),
          description: z.string().nullish().nullable().describe('Function description.'),
        }),
        z.object({
          action: z.literal('update'),
          functionId: z.string().min(1).describe('Function ID to update.'),
          name: z.string().min(1).nullish().describe('New function name.'),
          description: z.string().nullish().nullable().describe('New function description.'),
        }),
        z.object({
          action: z.literal('delete'),
          functionId: z.string().min(1).describe('Function ID to delete.'),
          name: z.string().min(1).nullish().describe('Name (ignored for delete).'),
          description: z.string().nullish().nullable().describe('Description (ignored for delete).'),
        }),
      ])
      .superRefine((data, context) => {
        if (data.action !== 'update') {
          return;
        }

        if (data.name !== undefined || data.description !== undefined) {
          return;
        }

        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'At least one field besides action and functionId must be provided',
        });
      });

    tools.manage_agent_function = createTool({
      id: 'manage_agent_function',
      description: 'Create new agent functions with custom prompts and descriptions, update existing functions, or delete unused functions.',
      inputSchema: manageAgentFunctionSchema,
      execute: async (input) => {
        if (input.action === 'create') {
          return capabilities.createFunction({
            name: input.name,
            description: input.description ?? undefined,
          });
        }

        if (input.action === 'delete') {
          const result = await capabilities.deleteFunction(input.functionId);
          await reloadAgentsForFunction(db, loaderConfig, input.functionId);
          return result;
        }

        const result = await capabilities.updateFunction({
          functionId: input.functionId,
          name: input.name,
          description: input.description,
        });
        await reloadAgentsForFunction(db, loaderConfig, input.functionId);
        return result;
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_agent_roles')) {
    tools.list_agent_roles = createTool({
      id: 'list_agent_roles',
      description: 'View all roles configured in the system. Roles bundle functions and tool permissions to define an agent\'s capabilities.',
      inputSchema: z.object({}),
      execute: async () => capabilities.listRoles(),
    });
  }

  if (hasToolPermission(allowedToolIds, 'manage_agent_role')) {
    // Keep branch-specific validation outside the discriminated union.
    // In Zod v3, adding `.refine()` to one branch wraps it in ZodEffects and
    // breaks `z.discriminatedUnion('action', ...)` at schema creation time.
    const manageAgentRoleSchema = z
      .discriminatedUnion('action', [
        z.object({
          action: z.literal('create'),
          roleId: z.string().min(1).nullish().describe('Role ID (optional, auto-generated if omitted).'),
          name: z.string().min(1).describe('Role name.'),
          description: z.string().nullish().nullable().describe('Role description.'),
        }),
        z.object({
          action: z.literal('update'),
          roleId: z.string().min(1).describe('Role ID to update.'),
          name: z.string().min(1).nullish().describe('New role name.'),
          description: z.string().nullish().nullable().describe('New role description.'),
        }),
        z.object({
          action: z.literal('delete'),
          roleId: z.string().min(1).describe('Role ID to delete.'),
          name: z.string().min(1).nullish().describe('Name (ignored for delete).'),
          description: z.string().nullish().nullable().describe('Description (ignored for delete).'),
        }),
      ])
      .superRefine((data, context) => {
        if (data.action !== 'update') {
          return;
        }

        if (data.name !== undefined || data.description !== undefined) {
          return;
        }

        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'At least one field besides action and roleId must be provided',
        });
      });

    tools.manage_agent_role = createTool({
      id: 'manage_agent_role',
      description: 'Create new roles with tool and workflow permissions, update existing role configurations, or delete roles no longer needed.',
      inputSchema: manageAgentRoleSchema,
      execute: async (input) => {
        if (input.action === 'create') {
          return capabilities.createRole({
            name: input.name,
            description: input.description ?? undefined,
          });
        }

        if (input.action === 'delete') {
          const result = await capabilities.deleteRole(input.roleId);
          await reloadAgentsForRole(db, loaderConfig, input.roleId);
          return result;
        }

        const result = await capabilities.updateRole({
          roleId: input.roleId,
          name: input.name,
          description: input.description,
        });
        await reloadAgentsForRole(db, loaderConfig, input.roleId);
        return result;
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
        const result = await capabilities.addRoleToFunction(input);
        await reloadAgentsForFunction(db, loaderConfig, input.functionId);
        return result;
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
      execute: async (input) => changeAgentFunction({
        db,
        loaderConfig,
        actorAgentId: currentAgentId,
        targetAgentId: input.agentId,
        functionId: input.functionId,
      }),
    });
  }

  if (hasToolPermission(allowedToolIds, 'change_own_function')) {
    tools.change_own_function = createTool({
      id: 'change_own_function',
      description: 'Switch your own assigned function to a different one. You will receive a notification and wake up with the new function\'s context and capabilities.',
      inputSchema: z.object({
        functionId: z.string().min(1).describe('Function ID to switch to.'),
      }),
      execute: async (input) => changeAgentFunction({
        db,
        loaderConfig,
        actorAgentId: currentAgentId,
        targetAgentId: currentAgentId,
        functionId: input.functionId,
      }),
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_role_tool_permissions')) {
    tools.list_role_tool_permissions = createTool({
      id: 'list_role_tool_permissions',
      description: 'View which custom tool IDs are permitted for a specific role. Tool IDs define granular access to specific capabilities.',
      inputSchema: z.object({
        roleId: z.string().min(1),
      }),
      execute: async (input) => capabilities.listRoleToolPermissions(input.roleId),
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
        const result = input.action === 'add'
          ? await capabilities.addRoleToolPermission({ roleId: input.roleId, toolId: input.toolId })
          : await capabilities.removeRoleToolPermission({ roleId: input.roleId, toolId: input.toolId });
        await reloadAgentsForRole(db, loaderConfig, input.roleId);
        return result;
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
      execute: async (input) => capabilities.listRoleWorkflowPermissions(input.roleId),
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
        const result = input.action === 'add'
          ? await capabilities.addRoleWorkflowPermission({ roleId: input.roleId, workflowId: input.workflowId })
          : await capabilities.removeRoleWorkflowPermission({ roleId: input.roleId, workflowId: input.workflowId });
        await reloadAgentsForRole(db, loaderConfig, input.roleId);
        return result;
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_available_capabilities')) {
    tools.list_available_capabilities = createTool({
      id: 'list_available_capabilities',
      description: 'Get a complete list of all available custom tool IDs and workflow IDs that can be assigned to roles for permission management.',
      inputSchema: z.object({}),
      execute: async () => ({
        toolIds: forgeCustomToolIds,
        workflowIds: forgeWorkflowIds,
      }),
    });
  }

  return tools as Record<string, Tool<unknown, unknown>>;
}
