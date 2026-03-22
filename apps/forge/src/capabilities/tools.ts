import { createTool, type Tool } from '@mastra/core/tools';
import { z } from 'zod';

import type { Database } from '../database/index';
import { forgeCustomToolIds, forgeWorkflowIds } from './catalog';
import { createCapabilityStore } from './store';
import type { AgentLoaderConfig } from '../agents/agent-loader';
import { changeAgentFunction, reloadAgentsForFunction, reloadAgentsForRole } from './runtime';

const toolIdSchema = z.enum(forgeCustomToolIds);
const workflowIdSchema = z.enum(forgeWorkflowIds);

function canCreateTool(allowedToolIds: Set<string> | null | undefined, toolId: string) {
  return !allowedToolIds || allowedToolIds.has(toolId);
}

export function createCapabilityTools(
  db: Database,
  loaderConfig: AgentLoaderConfig,
  currentAgentId: string,
  allowedToolIds?: Set<string> | null,
) {
  const capabilities = createCapabilityStore(db);
  const tools: Record<string, unknown> = {};

  if (canCreateTool(allowedToolIds, 'list_agent_functions')) {
    tools.list_agent_functions = createTool({
      id: 'list_agent_functions',
      description: 'List the internal agent functions.',
      inputSchema: z.object({}),
      execute: async () => capabilities.listFunctions(),
    });
  }

  if (canCreateTool(allowedToolIds, 'create_agent_function')) {
    tools.create_agent_function = createTool({
      id: 'create_agent_function',
      description: 'Create one internal agent function.',
      inputSchema: z.object({
        name: z.string().min(1),
        description: z.string().optional(),
      }),
      execute: async (input) => capabilities.createFunction(input),
    });
  }

  if (canCreateTool(allowedToolIds, 'update_agent_function')) {
    tools.update_agent_function = createTool({
      id: 'update_agent_function',
      description: 'Partially update one internal agent function.',
      inputSchema: z.object({
        functionId: z.string().min(1),
        name: z.string().min(1).optional(),
        description: z.string().optional().nullable(),
      }).refine((input) => Object.keys(input).length > 1, {
        message: 'At least one field besides functionId must be provided',
      }),
      execute: async ({ functionId, ...input }) => capabilities.updateFunction({ functionId, ...input }),
    });
  }

  if (canCreateTool(allowedToolIds, 'list_agent_roles')) {
    tools.list_agent_roles = createTool({
      id: 'list_agent_roles',
      description: 'List the internal agent roles.',
      inputSchema: z.object({}),
      execute: async () => capabilities.listRoles(),
    });
  }

  if (canCreateTool(allowedToolIds, 'create_agent_role')) {
    tools.create_agent_role = createTool({
      id: 'create_agent_role',
      description: 'Create one internal agent role.',
      inputSchema: z.object({
        name: z.string().min(1),
        description: z.string().optional(),
      }),
      execute: async (input) => capabilities.createRole(input),
    });
  }

  if (canCreateTool(allowedToolIds, 'update_agent_role')) {
    tools.update_agent_role = createTool({
      id: 'update_agent_role',
      description: 'Partially update one internal agent role.',
      inputSchema: z.object({
        roleId: z.string().min(1),
        name: z.string().min(1).optional(),
        description: z.string().optional().nullable(),
      }).refine((input) => Object.keys(input).length > 1, {
        message: 'At least one field besides roleId must be provided',
      }),
      execute: async ({ roleId, ...input }) => capabilities.updateRole({ roleId, ...input }),
    });
  }

  if (canCreateTool(allowedToolIds, 'assign_role_to_function')) {
    tools.assign_role_to_function = createTool({
      id: 'assign_role_to_function',
      description: 'Assign one role to one function.',
      inputSchema: z.object({
        functionId: z.string().min(1),
        roleId: z.string().min(1),
      }),
      execute: async (input) => {
        const result = await capabilities.assignRoleToFunction(input);
        await reloadAgentsForFunction(db, loaderConfig, input.functionId);
        return result;
      },
    });
  }

  if (canCreateTool(allowedToolIds, 'change_agent_function')) {
    tools.change_agent_function = createTool({
      id: 'change_agent_function',
      description: 'Change the function of another agent. This creates a notification for the target agent and wakes it.',
      inputSchema: z.object({
        agentId: z.string().min(1),
        functionId: z.string().min(1),
      }),
      execute: async (input) => {
        return changeAgentFunction({
          db,
          loaderConfig,
          actorAgentId: currentAgentId,
          targetAgentId: input.agentId,
          functionId: input.functionId,
        });
      },
    });
  }

  if (canCreateTool(allowedToolIds, 'change_own_function')) {
    tools.change_own_function = createTool({
      id: 'change_own_function',
      description: 'Change your own function. This creates a notification and wakes you with the new function context.',
      inputSchema: z.object({
        functionId: z.string().min(1),
      }),
      execute: async (input) => {
        return changeAgentFunction({
          db,
          loaderConfig,
          actorAgentId: currentAgentId,
          targetAgentId: currentAgentId,
          functionId: input.functionId,
        });
      },
    });
  }

  if (canCreateTool(allowedToolIds, 'list_role_tool_permissions')) {
    tools.list_role_tool_permissions = createTool({
      id: 'list_role_tool_permissions',
      description: 'List allowed custom tool ids for one role.',
      inputSchema: z.object({
        roleId: z.string().min(1),
      }),
      execute: async (input) => capabilities.listRoleToolPermissions(input.roleId),
    });
  }

  if (canCreateTool(allowedToolIds, 'add_role_tool_permission')) {
    tools.add_role_tool_permission = createTool({
      id: 'add_role_tool_permission',
      description: 'Grant one custom tool id to one role.',
      inputSchema: z.object({
        roleId: z.string().min(1),
        toolId: toolIdSchema,
      }),
      execute: async (input) => {
        const result = await capabilities.addRoleToolPermission(input);
        await reloadAgentsForRole(db, loaderConfig, input.roleId);
        return result;
      },
    });
  }

  if (canCreateTool(allowedToolIds, 'remove_role_tool_permission')) {
    tools.remove_role_tool_permission = createTool({
      id: 'remove_role_tool_permission',
      description: 'Remove one custom tool id from one role.',
      inputSchema: z.object({
        roleId: z.string().min(1),
        toolId: toolIdSchema,
      }),
      execute: async (input) => {
        const result = await capabilities.removeRoleToolPermission(input);
        await reloadAgentsForRole(db, loaderConfig, input.roleId);
        return result;
      },
    });
  }

  if (canCreateTool(allowedToolIds, 'list_role_workflow_permissions')) {
    tools.list_role_workflow_permissions = createTool({
      id: 'list_role_workflow_permissions',
      description: 'List allowed workflow ids for one role.',
      inputSchema: z.object({
        roleId: z.string().min(1),
      }),
      execute: async (input) => capabilities.listRoleWorkflowPermissions(input.roleId),
    });
  }

  if (canCreateTool(allowedToolIds, 'add_role_workflow_permission')) {
    tools.add_role_workflow_permission = createTool({
      id: 'add_role_workflow_permission',
      description: 'Grant one workflow id to one role.',
      inputSchema: z.object({
        roleId: z.string().min(1),
        workflowId: workflowIdSchema,
      }),
      execute: async (input) => {
        const result = await capabilities.addRoleWorkflowPermission(input);
        await reloadAgentsForRole(db, loaderConfig, input.roleId);
        return result;
      },
    });
  }

  if (canCreateTool(allowedToolIds, 'remove_role_workflow_permission')) {
    tools.remove_role_workflow_permission = createTool({
      id: 'remove_role_workflow_permission',
      description: 'Remove one workflow id from one role.',
      inputSchema: z.object({
        roleId: z.string().min(1),
        workflowId: workflowIdSchema,
      }),
      execute: async (input) => {
        const result = await capabilities.removeRoleWorkflowPermission(input);
        await reloadAgentsForRole(db, loaderConfig, input.roleId);
        return result;
      },
    });
  }

  if (canCreateTool(allowedToolIds, 'list_available_custom_tools')) {
    tools.list_available_custom_tools = createTool({
      id: 'list_available_custom_tools',
      description: 'List all custom tool ids available for permission management.',
      inputSchema: z.object({}),
      execute: async () => forgeCustomToolIds,
    });
  }

  if (canCreateTool(allowedToolIds, 'list_available_workflows')) {
    tools.list_available_workflows = createTool({
      id: 'list_available_workflows',
      description: 'List all workflow ids available for permission management.',
      inputSchema: z.object({}),
      execute: async () => forgeWorkflowIds,
    });
  }

  return tools as Record<string, Tool<unknown, unknown>>;
}
