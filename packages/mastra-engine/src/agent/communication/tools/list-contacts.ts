import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import type { createCommunicationModule } from '../module';

const listContactsInputSchema = z.object({});

export function createListContactsTool(communication: ReturnType<typeof createCommunicationModule>) {
  return createTool({
    id: 'list_contacts',
    description: 'List the known contacts registered by this agent.',
    inputSchema: listContactsInputSchema,
    execute: async () => {
      const contacts = await communication.listContacts();

      return {
        contacts: contacts.map((contact) => ({
          slug: contact.slug,
          displayName: contact.displayName,
          description: contact.description,
        })),
      };
    },
  });
}
