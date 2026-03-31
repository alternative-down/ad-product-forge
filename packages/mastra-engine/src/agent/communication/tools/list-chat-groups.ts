import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import type { CommunicationModule } from '../module';

const listChatGroupsInputSchema = z.object({
  provider: z.string().optional(),
  limit: z.number().int().positive().max(100).default(50),
});

export function createListChatGroupsTool(communication: CommunicationModule) {
  return createTool({
    id: 'list_chat_groups',
    description: 'List all internal chat groups accessible to this agent.',
    inputSchema: listChatGroupsInputSchema,
    execute: async (input) => {
      try {
        return await communication.listChatGroups({
          provider: input.provider,
          limit: input.limit ?? 50,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          valid: false,
          error: message,
          hint: 'Try again in a moment. If the problem persists, verify the communication store is available.',
        };
      }
    },
  });
}
