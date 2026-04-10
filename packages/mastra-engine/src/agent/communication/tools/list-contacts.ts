import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import type { CommunicationModule } from '../module';

const listContactsInputSchema = z.object({
  filter: z
    .enum(['self', 'others', 'all'])
    .optional()
    .describe("Which contacts to list. Use 'others' for the contacts you registered, 'self' for your own identities, or 'all' for both."),
});

export function createListContactsTool(communication: CommunicationModule) {
  return createTool({
    id: 'list_contacts',
    description:
      "List your contacts. Each contact includes the targetKey you should use with send_message, plus a slug in metadata when the provider also exposes a human-friendly identifier.",
    inputSchema: listContactsInputSchema,
    execute: async (input) => {
      try {
        return await communication.listContacts(input.filter ?? 'others');
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
