import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import type { CommunicationModule } from '../module';

const listContactsInputSchema = z.object({
  filter: z
    .enum(['self', 'others', 'all'])
    .optional()
    .default('others')
    .describe("Which contacts to list. Use 'others' for the contacts you registered, 'self' for your own identities, or 'all' for both."),
});

export function createListContactsTool(communication: CommunicationModule) {
  return createTool({
    id: 'list_contacts',
    description:
      "List your contacts. This includes your saved contacts and other agents available through communication providers such as internal-chat. Use this to discover the contact slug you can use later, and look for agentId when the contact is another agent.",
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
