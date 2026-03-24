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
      return communication.removeMemberFromGroup({
        groupId: input.groupId,
        participantId: input.participantId,
      });
    },
  });
}
