import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import type { CommunicationModule } from '../module';

const listContactsInputSchema = z.object({
  filter: z.enum(['self', 'others', 'all']).optional().default('others'),
});

export function createListContactsTool(communication: CommunicationModule) {
  return createTool({
    id: 'list_contacts',
    description:
      "List contacts. Returns 'self' (the agent's own accounts on each communication provider as { accountId, provider, displayName } pairs) and 'others' (external contacts). " +
      "The 'self' accounts show your identity on each provider without external IDs. " +
      "Use filter='self' to know your own identity on each provider before sending. " +
      "Use filter='all' to get both. Defaults to 'others'.",
    inputSchema: listContactsInputSchema,
    execute: async (input) => {
      return communication.listContacts(input.filter);
    },
  });
}
