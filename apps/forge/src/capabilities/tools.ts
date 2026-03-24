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
      description: 'List the internal agent functions.',
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
          functionId: z.string().min(1).optional(),
          name: z.string().min(1),
          description: z.string().optional().nullable(),
        }),
        z.object({
          action: z.literal('update'),
          functionId: z.string().min(1),
          name: z.string().min(1).optional(),
          description: z.string().optional().nullable(),
        }),
        z.object({
          action: z.literal('delete'),
          functionId: z.string().min(1),
          name: z.string().min(1).optional(),
          description: z.string().optional().nullable(),
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
      description: 'Create, update, or delete one internal agent function.',
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
      description: 'List the internal agent roles.',
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
          roleId: z.string().min(1).optional(),
          name: z.string().min(1),
          description: z.string().optional().nullable(),
        }),
        z.object({
          action: z.literal('update'),
          roleId: z.string().min(1),
          name: z.string().min(1).optional(),
          description: z.string().optional().nullable(),
        }),
        z.object({
          action: z.literal('delete'),
          roleId: z.string().min(1),
          name: z.string().min(1).optional(),
          description: z.string().optional().nullable(),
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
      description: 'Create, update, or delete one internal agent role.',
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
      description: 'Assign one role to one function without removing other assigned roles.',
      inputSchema: z.object({
        functionId: z.string().min(1),
        roleId: z.string().min(1),
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
      description: 'Change the function of another agent. This creates a notification for the target agent and wakes it.',
      inputSchema: z.object({
        agentId: z.string().min(1),
        functionId: z.string().min(1),
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
      description: 'Change your own function. This creates a notification and wakes you with the new function context.',
      inputSchema: z.object({
        functionId: z.string().min(1),
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
      description: 'List allowed custom tool ids for one role.',
      inputSchema: z.object({
        roleId: z.string().min(1),
      }),
      execute: async (input) => capabilities.listRoleToolPermissions(input.roleId),
    });
  }

  if (hasToolPermission(allowedToolIds, 'manage_role_tool_permissions')) {
    tools.manage_role_tool_permissions = createTool({
      id: 'manage_role_tool_permissions',
      description: 'Grant or remove one custom tool id for one role.',
      inputSchema: z.object({
        action: z.enum(['add', 'remove']),
        roleId: z.string().min(1),
        toolId: toolIdSchema,
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
      description: 'List allowed workflow ids for one role.',
      inputSchema: z.object({
        roleId: z.string().min(1),
      }),
      execute: async (input) => capabilities.listRoleWorkflowPermissions(input.roleId),
    });
  }

  if (hasToolPermission(allowedToolIds, 'manage_role_workflow_permissions')) {
    tools.manage_role_workflow_permissions = createTool({
      id: 'manage_role_workflow_permissions',
      description: 'Grant or remove one workflow id for one role.',
      inputSchema: z.object({
        action: z.enum(['add', 'remove']),
        roleId: z.string().min(1),
        workflowId: workflowIdSchema,
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
      description: 'List all custom tool ids and workflow ids available for permission management.',
      inputSchema: z.object({}),
      execute: async () => ({
        toolIds: forgeCustomToolIds,
        workflowIds: forgeWorkflowIds,
      }),
    });
  }

  return tools as Record<string, Tool<unknown, unknown>>;
}
