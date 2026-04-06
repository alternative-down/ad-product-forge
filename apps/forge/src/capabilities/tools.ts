import { forgeDebug } from '@mastra-engine/core';
import { createTool, type Tool } from '@mastra/core/tools';
import { z } from 'zod';

import type { AgentLoaderConfig } from '../agents/agent-loader';
import type { Database } from '../database/index';
import { changeAgentRole, reloadAgentsForRole } from './runtime';
import { createCapabilityStore } from './store';
import { forgeCapabilityIds, hasToolPermission } from './catalog';

const capabilityIdSchema = z.enum(forgeCapabilityIds);

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
      description: 'List the roles available in the system.',
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

  if (hasToolPermission(allowedToolIds, 'manage_agent_role')) {
    tools.manage_agent_role = createTool({
      id: 'manage_agent_role',
      description: 'Create, update, or delete a role.',
      inputSchema: z.object({
        action: z.enum(['create', 'update', 'delete']).describe('The role operation to perform.'),
        roleId: z.string().min(1).optional().describe('Required for update and delete.'),
        name: z.string().min(1).optional().describe('Required for create. Optional for update.'),
        description: z.string().optional().nullable().describe('Optional description for create or update.'),
      }),
      execute: async (input) => {
        forgeDebug('tools:capabilities', 'manage_agent_role called', { input });

        try {
          const result = await capabilities.manageRole(input);

          if ('roleId' in result && result.roleId) {
            await reloadAgentsForRole(db, loaderConfig, result.roleId);
          }

          forgeDebug('tools:capabilities', 'manage_agent_role success', { result });
          return { valid: true, ...result };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          forgeDebug('tools:capabilities', 'manage_agent_role error', { error: message });
          return {
            valid: false,
            error: message,
            hint: 'Use list_agent_roles to confirm the roleId when updating or deleting.',
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

  if (hasToolPermission(allowedToolIds, 'list_role_capabilities')) {
    tools.list_role_capabilities = createTool({
      id: 'list_role_capabilities',
      description: 'List every capability granted to a role, including tools and workflows.',
      inputSchema: z.object({
        roleId: z.string().min(1).describe('The roleId you want to inspect.'),
      }),
      execute: async (input) => {
        forgeDebug('tools:capabilities', 'list_role_capabilities called', { roleId: input.roleId });

        try {
          return await capabilities.listRoleCapabilities(input.roleId);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          forgeDebug('tools:capabilities', 'list_role_capabilities error', { error: message });
          return {
            valid: false,
            error: message,
            hint: 'Use list_agent_roles to confirm the roleId.',
          };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'manage_role_capabilities')) {
    tools.manage_role_capabilities = createTool({
      id: 'manage_role_capabilities',
      description: 'Add or remove one capability from a role. A capability can be either a tool or a workflow.',
      inputSchema: z.object({
        action: z.enum(['add', 'remove']).describe('Choose add to grant the capability or remove to revoke it.'),
        roleId: z.string().min(1).describe('The roleId you want to change.'),
        capabilityId: capabilityIdSchema.describe('The capabilityId to grant or revoke.'),
      }),
      execute: async (input) => {
        forgeDebug('tools:capabilities', 'manage_role_capabilities called', { input });

        try {
          const result = await capabilities.manageRoleCapability(input);
          await reloadAgentsForRole(db, loaderConfig, input.roleId);
          forgeDebug('tools:capabilities', 'manage_role_capabilities success', { result });
          return { valid: true, ...result };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          forgeDebug('tools:capabilities', 'manage_role_capabilities error', { error: message });
          return {
            valid: false,
            error: message,
            hint: 'Use list_agent_roles and list_available_capabilities to verify the roleId and capabilityId.',
          };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_available_capabilities')) {
    tools.list_available_capabilities = createTool({
      id: 'list_available_capabilities',
      description: 'List every capability that can be granted to a role, including tools and workflows.',
      inputSchema: z.object({}),
      execute: async () => ({
        capabilityIds: await capabilities.listAvailableCapabilities(),
      }),
    });
  }

  return tools;
}
