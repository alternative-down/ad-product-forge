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
      return communication.listChatGroups({
        provider: input.provider,
        limit: input.limit ?? 50,
      });
    },
  });
}
