import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import type { CommunicationModule } from '../module';

const createChatGroupInputSchema = z.object({
  provider: z.string().min(1),
  providerConversationKey: z.string().min(1),
  name: z.string().min(1),
  creatorId: z.string().min(1),
  creatorName: z.string().min(1),
});

export function createChatGroupTool(communication: CommunicationModule) {
  return createTool({
    id: 'create_chat_group',
    description: 'Create a new internal chat group for multi-participant conversations.',
    inputSchema: createChatGroupInputSchema,
    execute: async (input) => {
      return communication.createChatGroup({
        provider: input.provider,
        providerConversationKey: input.providerConversationKey,
        name: input.name,
        creatorId: input.creatorId,
        creatorName: input.creatorName,
      });
    },
  });
}
