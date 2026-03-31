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
      "Use <provider>:<contactSlug> to start a direct message via send_message. " +
      "Defaults to 'others'.",
    inputSchema: listContactsInputSchema,
    execute: async (input) => {
      try {
        return await communication.listContacts(input.filter);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          valid: false,
          error: message,
          hint: 'Try again in a moment. If the problem persists, verify the communication store is available.',
        };
      }
    },
  });
}
