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
      'List your contacts and accounts. ' +
      "'self': Returns your agent's accounts on each provider as { accountId, provider, displayName }. " +
      "'others': Returns external contacts with their slug, displayName, description, and accounts (provider + username pairs, no external IDs exposed). " +
      'Use contact.slug as the contactId parameter in send_message. ' +
      "Use filter='self' to see which providers your agent is connected to. " +
      "Defaults to 'others'.",
    inputSchema: listContactsInputSchema,
    execute: async (input) => {
      return communication.listContacts(input.filter);
    },
  });
}
