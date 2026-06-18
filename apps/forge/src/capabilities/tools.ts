import { forgeDebug } from '@forge-runtime/core';
import { createTool, type Tool } from '@forge-runtime/core';
import { z } from 'zod';

import type { AgentLoaderConfig } from '../agents/agent-loader';

import type { Database } from '../database/client';
import { changeAgentRole, reloadAgentsForRole } from './runtime';
import { createCapabilityStore } from './store';
import { forgeCapabilityIds, hasToolPermission } from './catalog';
import { withToolErrorLogging } from './tools/error-wrapper';

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
        forgeDebug({
          scope: 'tools:capabilities',
          level: 'info',
          message: 'list_agent_roles called',
        });

        return await withToolErrorLogging({
          scope: 'tools:capabilities',
          op: 'list_agent_roles',
          hint: 'Try again in a moment. If the problem persists, verify the capability store is available.',
          fn: async () => {
            const result = await capabilities.listRoles();
            forgeDebug({
              scope: 'tools:capabilities',
              level: 'info',
              message: 'list_agent_roles result',
              context: {
                count: result.length,
                roles: result.map((role: any) => ({
                  roleId: (role as any).roleId,
                  name: (role as any).name,
                })),
              },
            });
            return result;
          },
        });
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'manage_agent_role')) {
    tools.manage_agent_role = createTool({
      id: 'manage_agent_role',
      description: 'Create, update, or delete a role.',
      inputSchema: z.object({
        action: z.enum(['create', 'update', 'delete']).describe('The role operation to perform.'),
        create: z
          .object({
            name: z.string().optional().describe('Required role name for the new role.'),
            description: z.string().optional().describe('Optional description for the new role.'),
          })
          .optional()
          .describe('Provide this object only when action is create.'),
        update: z
          .object({
            roleId: z.string().optional().describe('Required roleId to update one existing role.'),
            name: z.string().optional().describe('Optional new role name.'),
            description: z.string().optional().describe('Optional new description.'),
          })
          .optional()
          .describe('Provide this object only when action is update.'),
        delete: z
          .object({
            roleId: z.string().optional().describe('Required roleId to delete one existing role.'),
          })
          .optional()
          .describe('Provide this object only when action is delete.'),
      }),
      execute: async (input) => {
        forgeDebug({
          scope: 'tools:capabilities',
          level: 'info',
          message: 'manage_agent_role called',
          context: { input },
        });

        if (input.action === 'create') {
          if (!input.create) {
            return {
              valid: false,
              error: 'create is required when action is create',
              hint: 'Provide create.name and optionally create.description.',
            };
          }

          if (input.create.name == null) {
            return {
              valid: false,
              error: 'create.name is required when action is create',
              hint: 'Provide the new role name in create.name.',
            };
          }

          const createInput = input.create;
          return await withToolErrorLogging({
            scope: 'tools:capabilities',
            op: 'manage_agent_role',
            hint: 'Use list_agent_roles to confirm the roleId when updating or deleting.',
            fn: async () => {
              const result = await capabilities.manageRole({
                action: 'create',
                name: createInput.name,
                description: createInput.description,
              });

              if ('roleId' in result && result.roleId != null) {
                await reloadAgentsForRole(db, loaderConfig, result.roleId);
              }

              forgeDebug({
                scope: 'tools:capabilities',
                level: 'info',
                message: 'manage_agent_role success',
                context: { result },
              });
              return result;
            },
          });
        }

        if (input.action === 'update') {
          if (!input.update) {
            return {
              valid: false,
              error: 'update is required when action is update',
              hint: 'Provide update.roleId and at least one field to change.',
            };
          }

          if (input.update.roleId == null) {
            return {
              valid: false,
              error: 'update.roleId is required when action is update',
              hint: 'Use list_agent_roles to find the roleId you want to change.',
            };
          }

          const updateInput = input.update;
          return await withToolErrorLogging({
            scope: 'tools:capabilities',
            op: 'manage_agent_role',
            hint: 'Use list_agent_roles to confirm the roleId when updating or deleting.',
            fn: async () => {
              const result = await capabilities.manageRole({
                action: 'update',
                roleId: updateInput.roleId,
                name: updateInput.name,
                description: updateInput.description,
              });

              if ('roleId' in result && result.roleId != null) {
                await reloadAgentsForRole(db, loaderConfig, result.roleId);
              }

              forgeDebug({
                scope: 'tools:capabilities',
                level: 'info',
                message: 'manage_agent_role success',
                context: { result },
              });
              return result;
            },
          });
        }

        if (!input.delete) {
          return {
            valid: false,
            error: 'delete is required when action is delete',
            hint: 'Provide delete.roleId.',
          };
        }

        if (input.delete.roleId == null) {
          return {
            valid: false,
            error: 'delete.roleId is required when action is delete',
            hint: 'Use list_agent_roles to find the roleId you want to delete.',
          };
        }

        const deleteInput = input.delete;
        return await withToolErrorLogging({
          scope: 'tools:capabilities',
          op: 'manage_agent_role',
          hint: 'Use list_agent_roles to confirm the roleId when updating or deleting.',
          fn: async () => {
            const result = await capabilities.manageRole({
              action: 'delete',
              roleId: deleteInput.roleId,
            });

            if ('roleId' in result && result.roleId != null) {
              await reloadAgentsForRole(db, loaderConfig, result.roleId);
            }

            forgeDebug({
              scope: 'tools:capabilities',
              level: 'info',
              message: 'manage_agent_role success',
              context: { result },
            });
            return result;
          },
        });
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
        forgeDebug({
          scope: 'tools:capabilities',
          level: 'info',
          message: 'change_agent_role called',
          context: { input },
        });

        return await withToolErrorLogging({
          scope: 'tools:capabilities',
          op: 'change_agent_role',
          hint: 'Use list_agents and list_agent_roles to verify the agentId and roleId.',
          fn: async () => {
            const result = await changeAgentRole({
              db,
              loaderConfig,
              actorAgentId: currentAgentId,
              targetAgentId: input.agentId,
              roleId: input.roleId,
            });
            forgeDebug({
              scope: 'tools:capabilities',
              level: 'info',
              message: 'change_agent_role success',
              context: { result },
            });
            return result;
          },
        });
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_agent_statuses')) {
    tools.list_agent_statuses = createTool({
      id: 'list_agent_statuses',
      description:
        'List the current execution status of agents, such as idle or running. You can filter by one agentId or by one executionState.',
      inputSchema: z.object({
        agentId: z
          .string()
          .optional()
          .describe('Optional agentId if you want to inspect one specific agent.'),
        executionState: z
          .enum(['idle', 'running'])
          .optional()
          .describe('Optional execution state filter. Use idle or running.'),
      }),
      execute: async (input) => {
        forgeDebug({
          scope: 'tools:capabilities',
          level: 'info',
          message: 'list_agent_statuses called',
          context: { input },
        });

        return await withToolErrorLogging({
          scope: 'tools:capabilities',
          op: 'list_agent_statuses',
          hint: 'Verify the agentId when filtering one agent.',
          fn: async () => {
            const result = await capabilities.listAgentStatuses({
              agentId: input.agentId ?? undefined,
              executionState: input.executionState ?? undefined,
            });
            forgeDebug({
              scope: 'tools:capabilities',
              level: 'info',
              message: 'list_agent_statuses result',
              context: { count: result.length },
            });
            return result;
          },
        });
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_role_capabilities')) {
    tools.list_role_capabilities = createTool({
      id: 'list_role_capabilities',
      description:
        'List every capability in the system for one role, marking each one with granted true or false.',
      inputSchema: z.object({
        roleId: z.string().min(1).describe('The roleId you want to inspect.'),
      }),
      execute: async (input) => {
        forgeDebug({
          scope: 'tools:capabilities',
          level: 'info',
          message: 'list_role_capabilities called',
          context: { roleId: input.roleId },
        });

        return await withToolErrorLogging({
          scope: 'tools:capabilities',
          op: 'list_role_capabilities',
          hint: 'Use list_agent_roles to confirm the roleId.',
          fn: () => capabilities.listRoleCapabilities(input.roleId),
        });
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'manage_role_capabilities')) {
    tools.manage_role_capabilities = createTool({
      id: 'manage_role_capabilities',
      description:
        'Add or remove one capability from a role. A capability can be either a tool or a workflow.',
      inputSchema: z.object({
        action: z
          .enum(['add', 'remove'])
          .describe('Choose add to grant the capability or remove to revoke it.'),
        roleId: z.string().min(1).describe('The roleId you want to change.'),
        capabilityId: capabilityIdSchema.describe('The capabilityId to grant or revoke.'),
      }),
      execute: async (input) => {
        forgeDebug({
          scope: 'tools:capabilities',
          level: 'info',
          message: 'manage_role_capabilities called',
          context: { input },
        });

        return await withToolErrorLogging({
          scope: 'tools:capabilities',
          op: 'manage_role_capabilities',
          hint: 'Use list_agent_roles and list_role_capabilities to verify the roleId and capabilityId.',
          fn: async () => {
            const result = await capabilities.manageRoleCapability(input);
            await reloadAgentsForRole(db, loaderConfig, input.roleId);
            forgeDebug({
              scope: 'tools:capabilities',
              level: 'info',
              message: 'manage_role_capabilities success',
              context: { result },
            });
            return result;
          },
        });
      },
    });
  }

  return tools;
}
