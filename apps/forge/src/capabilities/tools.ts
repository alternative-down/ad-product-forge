import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import type { Database } from '../database/index.js';
import { forgeCustomToolIds, forgeWorkflowIds } from './catalog.js';
import { createCapabilityStore } from './store.js';
import type { AgentLoaderConfig } from '../agents/agent-loader.js';
import { reloadAgentIfLoaded, reloadAgentsForFunction, reloadAgentsForRole } from './runtime.js';

const toolIdSchema = z.enum(forgeCustomToolIds);
const workflowIdSchema = z.enum(forgeWorkflowIds);

export function createCapabilityTools(db: Database, loaderConfig: AgentLoaderConfig) {
  const capabilities = createCapabilityStore(db);

  return {
    list_agent_functions: createTool({
      id: 'list_agent_functions',
      description: 'List the internal agent functions.',
      inputSchema: z.object({}),
      execute: async () => capabilities.listFunctions(),
    }),
    create_agent_function: createTool({
      id: 'create_agent_function',
      description: 'Create one internal agent function.',
      inputSchema: z.object({
        name: z.string().min(1),
        description: z.string().optional(),
      }),
      execute: async (input) => capabilities.createFunction(input),
    }),
    update_agent_function: createTool({
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
    }),
    list_agent_roles: createTool({
      id: 'list_agent_roles',
      description: 'List the internal agent roles.',
      inputSchema: z.object({}),
      execute: async () => capabilities.listRoles(),
    }),
    create_agent_role: createTool({
      id: 'create_agent_role',
      description: 'Create one internal agent role.',
      inputSchema: z.object({
        name: z.string().min(1),
        description: z.string().optional(),
      }),
      execute: async (input) => capabilities.createRole(input),
    }),
    update_agent_role: createTool({
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
    }),
    assign_role_to_function: createTool({
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
    }),
    assign_function_to_agent: createTool({
      id: 'assign_function_to_agent',
      description: 'Assign one function to one agent. Use null to remove the function assignment and restore unrestricted custom tool/workflow access.',
      inputSchema: z.object({
        agentId: z.string().min(1),
        functionId: z.string().min(1).nullable(),
      }),
      execute: async (input) => {
        const result = await capabilities.assignFunctionToAgent(input);
        await reloadAgentIfLoaded(db, loaderConfig, input.agentId);
        return result;
      },
    }),
    list_role_tool_permissions: createTool({
      id: 'list_role_tool_permissions',
      description: 'List allowed custom tool ids for one role.',
      inputSchema: z.object({
        roleId: z.string().min(1),
      }),
      execute: async (input) => capabilities.listRoleToolPermissions(input.roleId),
    }),
    add_role_tool_permission: createTool({
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
    }),
    remove_role_tool_permission: createTool({
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
    }),
    list_role_workflow_permissions: createTool({
      id: 'list_role_workflow_permissions',
      description: 'List allowed workflow ids for one role.',
      inputSchema: z.object({
        roleId: z.string().min(1),
      }),
      execute: async (input) => capabilities.listRoleWorkflowPermissions(input.roleId),
    }),
    add_role_workflow_permission: createTool({
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
    }),
    remove_role_workflow_permission: createTool({
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
    }),
    list_available_custom_tools: createTool({
      id: 'list_available_custom_tools',
      description: 'List all custom tool ids available for permission management.',
      inputSchema: z.object({}),
      execute: async () => forgeCustomToolIds,
    }),
    list_available_workflows: createTool({
      id: 'list_available_workflows',
      description: 'List all workflow ids available for permission management.',
      inputSchema: z.object({}),
      execute: async () => forgeWorkflowIds,
    }),
  };
}
