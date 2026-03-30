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
      return communication.listGroupMembers(input.groupId);
    },
  });
}
