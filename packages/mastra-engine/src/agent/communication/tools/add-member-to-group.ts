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
      return communication.addMemberToGroup({
        groupId: input.groupId,
        participantId: input.participantId,
        participantName: input.participantName,
        role: input.role,
      });
    },
  });
}
