import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import type { CommunicationModule } from '../module';

const addMemberInputSchema = z.object({
  groupId: z.string().min(1),
  participantSlug: z.string().min(1),
  role: z.enum(['admin', 'normal']).default('normal'),
});

export function createAddMemberTool(communication: CommunicationModule) {
  return createTool({
    id: 'add_member_to_group',
    description: 'Add a member to an existing internal chat group using the contact slug returned by list_contacts.',
    inputSchema: addMemberInputSchema,
    execute: async (input) => {
      try {
        const result = await communication.addMemberToGroup({
          groupId: input.groupId,
          participantSlug: input.participantSlug,
          role: input.role,
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
              hint: 'The group or contact may not exist. Use list_chat_groups and list_contacts to find valid values.',
            };
          }
          if (error.message.includes('already exists') || error.message.includes('duplicate')) {
            return {
              valid: false,
              error: error.message,
              hint: 'The member is already in the group.',
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
          error: 'An unknown error occurred while adding the member',
          hint: 'Verify the groupId and participantSlug are valid.',
        };
      }
    },
  });
}
