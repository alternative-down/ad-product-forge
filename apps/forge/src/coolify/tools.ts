import { forgeDebug } from '@forge-runtime/core';
import { createTool, type Tool } from '@forge-runtime/core';
import { z } from 'zod';

import { hasToolPermission } from '../capabilities/catalog';
import type { CoolifyManager } from './manager';

export function createCoolifyTools(coolify: CoolifyManager, allowedToolIds?: Set<string> | null) {
  const tools: Record<string, Tool<unknown, unknown>> = {};

  // --- Scoped application tools (replaces raw get_coolify_credentials) ---

  if (hasToolPermission(allowedToolIds, 'list_coolify_applications')) {
    tools.list_coolify_applications = createTool({
      id: 'list_coolify_applications',
      description: 'List all Coolify applications configured in Forge.',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const applications = await coolify.listApplications();
          return { success: true as const, applications };
        } catch (error) {
          forgeDebug({
            scope: 'tools:coolify',
            level: 'error',
            message: 'list_coolify_applications error',
            context: {
              error: error instanceof Error ? error.message : String(error),
            },
          });
          return {
            success: false as const,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'start_coolify_application')) {
    tools.start_coolify_application = createTool({
      id: 'start_coolify_application',
      description: 'Start a Coolify application by its UUID.',
      inputSchema: z.object({
        applicationUuid: z.string().describe('UUID of the Coolify application to start'),
      }),
      execute: async (input: { applicationUuid: string }) => {
        try {
          await coolify.startApplication(input.applicationUuid);
          return { success: true as const, applicationUuid: input.applicationUuid };
        } catch (error) {
          forgeDebug({
            scope: 'tools:coolify',
            level: 'error',
            message: 'start_coolify_application error',
            context: {
              error: error instanceof Error ? error.message : String(error),
            },
          });
          return {
            success: false as const,
            applicationUuid: input.applicationUuid,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'stop_coolify_application')) {
    tools.stop_coolify_application = createTool({
      id: 'stop_coolify_application',
      description: 'Stop a Coolify application by its UUID.',
      inputSchema: z.object({
        applicationUuid: z.string().describe('UUID of the Coolify application to stop'),
      }),
      execute: async (input: { applicationUuid: string }) => {
        try {
          await coolify.stopApplication(input.applicationUuid);
          return { success: true as const, applicationUuid: input.applicationUuid };
        } catch (error) {
          forgeDebug({
            scope: 'tools:coolify',
            level: 'error',
            message: 'stop_coolify_application error',
            context: {
              error: error instanceof Error ? error.message : String(error),
            },
          });
          return {
            success: false as const,
            applicationUuid: input.applicationUuid,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'get_coolify_application_logs')) {
    tools.get_coolify_application_logs = createTool({
      id: 'get_coolify_application_logs',
      description: 'Get the live logs of a Coolify application by its UUID.',
      inputSchema: z.object({
        applicationUuid: z.string().describe('UUID of the Coolify application'),
        lines: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Number of log lines to fetch (default: 100)'),
      }),
      execute: async (input: { applicationUuid: string; lines?: number }) => {
        try {
          const result = await coolify.getApplicationLogs({
            applicationUuid: input.applicationUuid,
            lines: input.lines,
          });
          return { success: true as const, ...result };
        } catch (error) {
          forgeDebug({
            scope: 'tools:coolify',
            level: 'error',
            message: 'get_coolify_application_logs error',
            context: {
              error: error instanceof Error ? error.message : String(error),
            },
          });
          return {
            success: false as const,
            applicationUuid: input.applicationUuid,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    });
  }

  return tools;
}
