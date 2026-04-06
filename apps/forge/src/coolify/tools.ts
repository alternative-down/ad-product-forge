import { forgeDebug } from '@mastra-engine/core';
import { createTool, type Tool } from '@mastra/core/tools';
import { z } from 'zod';

import { hasToolPermission } from '../capabilities/catalog';
import type { CoolifyManager } from './manager';

export function createCoolifyTools(coolify: CoolifyManager, allowedToolIds?: Set<string> | null) {
  const tools: Record<string, Tool<unknown, unknown>> = {};

  if (hasToolPermission(allowedToolIds, 'get_coolify_credentials')) {
    tools.get_coolify_credentials = createTool({
      id: 'get_coolify_credentials',
      description: 'Get the Coolify API credentials configured for Forge so you can call the Coolify API directly with curl.',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          forgeDebug('tools:coolify', 'get_coolify_credentials called');
          const result = await coolify.getCredentials();
          forgeDebug('tools:coolify', 'get_coolify_credentials result', { hasBaseUrl: !!result.baseUrl });
          return result;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          forgeDebug('tools:coolify', 'get_coolify_credentials error', { error: message });
          return {
            valid: false,
            error: message,
            hint: 'Verify Coolify integration is configured and enabled.',
          };
        }
      },
    });
  }

  return tools;
}
