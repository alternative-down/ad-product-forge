import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import type { CommunicationModule } from '../module';

const addMemberInputSchema = z.object({
  groupId: z.string().min(1),
  participantId: z.string().min(1),
  participantName: z.string().min(1),
  role: z.enum(['admin', 'normal']).default('normal'),
});

export function createAddMemberTool(communication: CommunicationModule) {
  return createTool({
    id: 'add_member_to_group',
    description: 'Add a member to an existing internal chat group.',
    inputSchema: addMemberInputSchema,
    execute: async (input) => {
      try {
        return await communication.addMemberToGroup({
          groupId: input.groupId,
          participantId: input.participantId,
          participantName: input.participantName,
          role: input.role,
        });
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes('not found') || error.message.includes('does not exist')) {
            return {
              error: error.message,
              hint: 'The group may not exist. Use list_chat_groups to find valid group IDs.',
            };
          }
          if (error.message.includes('already exists') || error.message.includes('duplicate')) {
            return {
              error: error.message,
              hint: 'The member is already in the group.',
            };
          }
          return {
            error: error.message,
            hint: 'Verify the groupId and participantId are valid.',
          };
        }
        return {
          error: 'An unknown error occurred while adding the member',
          hint: 'Verify the groupId and participantId are valid.',
        };
      }
    },
  });
}
