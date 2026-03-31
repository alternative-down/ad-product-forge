import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import type { CommunicationModule } from '../module';

const listGroupMembersInputSchema = z.object({
  groupId: z.string().min(1),
});

export function createListGroupMembersTool(communication: CommunicationModule) {
  return createTool({
    id: 'list_group_members',
    description: 'List all members of an internal chat group, returning participant slugs that can be used in remove_member_from_group.',
    inputSchema: listGroupMembersInputSchema,
    execute: async (input) => {
      try {
        return await communication.listGroupMembers(input.groupId);
      } catch (error) {
        if (error instanceof Error) {
          return {
            valid: false,
            error: error.message,
            hint: 'Use list_chat_groups to confirm the groupId is correct before listing members.',
          };
        }
        return {
          valid: false,
          error: 'An unknown error occurred while listing group members',
          hint: 'Use list_chat_groups to confirm the groupId is correct before listing members.',
        };
      }
    },
  });
}
