import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import type { CommunicationModule } from '../module';

const removeMemberInputSchema = z.object({
  groupId: z.string().min(1),
  participantSlug: z.string().min(1),
});

export function createRemoveMemberTool(communication: CommunicationModule) {
  return createTool({
    id: 'remove_member_from_group',
    description: 'Remove a member from an internal chat group using the participant slug returned by list_group_members.',
    inputSchema: removeMemberInputSchema,
    execute: async (input) => {
      try {
        const result = await communication.removeMemberFromGroup({
          groupId: input.groupId,
          participantSlug: input.participantSlug,
        });
        return {
          valid: true,
          ...result,
        };
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes('not found') || error.message.includes('does not exist')) {
            return {
              valid: false,
              error: error.message,
              hint: 'The group or member may not exist. Use list_chat_groups and list_group_members to verify.',
            };
          }
          return {
            valid: false,
            error: error.message,
            hint: 'Verify the groupId and participantSlug are valid.',
          };
        }
        return {
          valid: false,
          error: 'An unknown error occurred while removing the member',
          hint: 'Verify the groupId and participantSlug are valid.',
        };
      }
    },
  });
}
