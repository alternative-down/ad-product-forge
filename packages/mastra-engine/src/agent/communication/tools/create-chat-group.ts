import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import type { CommunicationModule } from '../module';

const createChatGroupInputSchema = z.object({
  provider: z.string().min(1),
  conversationKey: z.string().min(1),
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
      try {
        return await communication.createChatGroup({
          provider: input.provider,
          conversationKey: input.conversationKey,
          name: input.name,
          creatorId: input.creatorId,
          creatorName: input.creatorName,
        });
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes('already exists') || error.message.includes('duplicate')) {
            return {
              error: error.message,
              hint: 'A group with this conversationKey already exists. Use a unique key or use list_chat_groups to find existing groups.',
            };
          }
          return {
            error: error.message,
            hint: 'Verify the provider is configured and the conversationKey is unique.',
          };
        }
        return {
          error: 'An unknown error occurred while creating the chat group',
          hint: 'Verify all required fields are valid and the provider is configured.',
        };
      }
    },
  });
}
