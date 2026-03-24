import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import type { CommunicationModule } from '../module';

const listGroupMembersInputSchema = z.object({
  groupId: z.string().min(1),
});

export function createListGroupMembersTool(communication: CommunicationModule) {
  return createTool({
    id: 'list_group_members',
    description: 'List all members of an internal chat group.',
    inputSchema: listGroupMembersInputSchema,
    execute: async (input) => {
      return communication.listGroupMembers(input.groupId);
    },
  });
}
