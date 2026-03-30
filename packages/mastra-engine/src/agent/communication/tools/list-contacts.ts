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
      'List your contacts organized by category. ' +
      "'self': Returns your accounts on each provider. " +
      "'others': Returns external contacts. " +
      "Use <provider>:<contactSlug> to send messages via send_message. " +
      "Defaults to 'others'.",
    inputSchema: listContactsInputSchema,
    execute: async (input) => {
      return communication.listContacts(input.filter);
    },
  });
}
