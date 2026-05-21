import { forgeDebug } from '@forge-runtime/core';
import { createTool, type Tool } from '@forge-runtime/core';
import { z } from 'zod';

import type { AgentLoaderConfig } from '../agents/agent-loader';

import type { Database } from '../database/schema';
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
        forgeDebug({
          scope: 'tools:capabilities',
          level: 'info',
          message: 'list_agent_roles called',
        });

        try {
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
        } catch (error) {
          forgeDebug({
            scope: 'tools:capabilities',
            level: 'error',
            message: 'list_agent_roles error',
            context: { error: String(serializeError(error)) },
          });
          return {
            valid: false,
            error: String(serializeError(error)),
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

        try {
          if (input.action === 'create') {
            if (!input.create) {
              return {
                valid: false,
                error: 'create is required when action is create',
                hint: 'Provide create.name and optionally create.description.',
              };
            }

            if (input.create.name === null || input.create.name === undefined) {
              return {
                valid: false,
                error: 'create.name is required when action is create',
                hint: 'Provide the new role name in create.name.',
              };
            }

            const result = await capabilities.manageRole({
              action: 'create',
              name: input.create.name,
              description: input.create.description,
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
            return { valid: true, ...result };
          }

          if (input.action === 'update') {
            if (!input.update) {
              return {
                valid: false,
                error: 'update is required when action is update',
                hint: 'Provide update.roleId and at least one field to change.',
              };
            }

            if (input.update.roleId === null || input.update.roleId === undefined) {
              return {
                valid: false,
                error: 'update.roleId is required when action is update',
                hint: 'Use list_agent_roles to find the roleId you want to change.',
              };
            }

            const result = await capabilities.manageRole({
              action: 'update',
              roleId: input.update.roleId,
              name: input.update.name,
              description: input.update.description,
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
            return { valid: true, ...result };
          }

          if (!input.delete) {
            return {
              valid: false,
              error: 'delete is required when action is delete',
              hint: 'Provide delete.roleId.',
            };
          }

          if (input.delete.roleId === null || input.delete.roleId === undefined) {
              return {
                valid: false,
                error: 'delete.roleId is required when action is delete',
                hint: 'Use list_agent_roles to find the roleId you want to delete.',
              };
            }

            const result = await capabilities.manageRole({
              action: 'delete',
              roleId: input.delete.roleId,
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
          return { valid: true, ...result };
        } catch (error) {
          forgeDebug({
            scope: 'tools:capabilities',
            level: 'error',
            message: 'manage_agent_role error',
            context: { error: String(serializeError(error)) },
          });
          return {
            valid: false,
            error: String(serializeError(error)),
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
        forgeDebug({
          scope: 'tools:capabilities',
          level: 'info',
          message: 'change_agent_role called',
          context: { input },
        });

        try {
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
          return { valid: true, ...result };
        } catch (error) {
          forgeDebug({
            scope: 'tools:capabilities',
            level: 'error',
            message: 'change_agent_role error',
            context: { error: String(serializeError(error)) },
          });
          return {
            valid: false,
            error: String(serializeError(error)),
            hint: 'Use list_agents and list_agent_roles to verify the agentId and roleId.',
          };
        }
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

        try {
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
        } catch (error) {
          forgeDebug({
            scope: 'tools:capabilities',
            level: 'error',
            message: 'list_agent_statuses error',
            context: { error: String(serializeError(error)) },
          });
          return {
            valid: false,
            error: String(serializeError(error)),
            hint: 'Verify the agentId when filtering one agent.',
          };
        }
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

        try {
          return await capabilities.listRoleCapabilities(input.roleId);
        } catch (error) {
          forgeDebug({
            scope: 'tools:capabilities',
            level: 'error',
            message: 'list_role_capabilities error',
            context: { error: String(serializeError(error)) },
          });
          return {
            valid: false,
            error: String(serializeError(error)),
            hint: 'Use list_agent_roles to confirm the roleId.',
          };
        }
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

        try {
          const result = await capabilities.manageRoleCapability(input);
          await reloadAgentsForRole(db, loaderConfig, input.roleId);
          forgeDebug({
            scope: 'tools:capabilities',
            level: 'info',
            message: 'manage_role_capabilities success',
            context: { result },
          });
          return { valid: true, ...result };
        } catch (error) {
          forgeDebug({
            scope: 'tools:capabilities',
            level: 'error',
            message: 'manage_role_capabilities error',
            context: { error: String(serializeError(error)) },
          });
          return {
            valid: false,
            error: String(serializeError(error)),
            hint: 'Use list_agent_roles and list_role_capabilities to verify the roleId and capabilityId.',
          };
        }
      },
    });
  }

  return tools;
}
import { serializeError } from '../agents/agent-runner-error-formatting';
