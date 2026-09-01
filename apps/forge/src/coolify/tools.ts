import { createTool, type Tool } from '@forge-runtime/core';
import { z } from 'zod';

import { hasToolPermission } from '../capabilities/catalog';
import {
  withToolErrorLogging,
  type ToolResult,
} from '../capabilities/tools/error-wrapper';
import type { CoolifyManager } from './manager';

export function createCoolifyTools(coolify: CoolifyManager, allowedToolIds?: Set<string> | null) {
  const tools: Record<string, Tool<unknown, unknown>> = {};

  // --- Scoped application tools (replaces raw get_coolify_credentials) ---

  if (hasToolPermission(allowedToolIds, 'list_coolify_applications')) {
    tools.list_coolify_applications = createTool({
      id: 'list_coolify_applications',
      description: 'List all Coolify applications configured in Forge.',
      inputSchema: z.object({}),
      execute: async (): Promise<ToolResult<unknown>> => {
        return await withToolErrorLogging({
          scope: 'tools:coolify',
          op: 'list_coolify_applications',
          hint: 'Verify Coolify is reachable and your API key has list permissions.',
          fn: async () => {
            const applications = await coolify.listApplications();
            return { success: true as const, applications };
          },
        });
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
      execute: async (input: { applicationUuid: string }): Promise<ToolResult<unknown>> => {
        return await withToolErrorLogging({
          scope: 'tools:coolify',
          op: 'start_coolify_application',
          hint: 'Verify the application UUID is correct and the app is not already running.',
          fn: async () => {
            await coolify.startApplication(input.applicationUuid);
            return { success: true as const, applicationUuid: input.applicationUuid };
          },
        });
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
      execute: async (input: { applicationUuid: string }): Promise<ToolResult<unknown>> => {
        return await withToolErrorLogging({
          scope: 'tools:coolify',
          op: 'stop_coolify_application',
          hint: 'Verify the application UUID is correct and the app is currently running.',
          fn: async () => {
            await coolify.stopApplication(input.applicationUuid);
            return { success: true as const, applicationUuid: input.applicationUuid };
          },
        });
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
      execute: async (input: { applicationUuid: string; lines?: number }): Promise<ToolResult<unknown>> => {
        return await withToolErrorLogging({
          scope: 'tools:coolify',
          op: 'get_coolify_application_logs',
          hint: 'Verify the application UUID is correct and you have log access permissions.',
          fn: async () => {
            const result = await coolify.getApplicationLogs({
              applicationUuid: input.applicationUuid,
              lines: input.lines,
            });
            return { success: true as const, ...result };
          },
        });
      },
    });
  }

  return tools;
}
