import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import type { CommunicationModule } from '../module';

const removeMemberInputSchema = z.object({
  groupId: z.string().min(1),
  participantId: z.string().min(1),
});

export function createRemoveMemberTool(communication: CommunicationModule) {
  return createTool({
    id: 'remove_member_from_group',
    description: 'Remove a member from an internal chat group.',
    inputSchema: removeMemberInputSchema,
    execute: async (input) => {
      try {
        return await communication.removeMemberFromGroup({
          groupId: input.groupId,
          participantId: input.participantId,
        });
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes('not found') || error.message.includes('does not exist')) {
            return {
              error: error.message,
              hint: 'The group or member may not exist. Use list_chat_groups and list_group_members to verify.',
            };
          }
          return {
            error: error.message,
            hint: 'Verify the groupId and participantId are valid.',
          };
        }
        return {
          error: 'An unknown error occurred while removing the member',
          hint: 'Verify the groupId and participantId are valid.',
        };
      }
    },
  });
}
