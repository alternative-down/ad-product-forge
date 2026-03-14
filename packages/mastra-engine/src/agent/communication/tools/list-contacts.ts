import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { agentContacts } from '../agent-contacts';

const listContactsInputSchema = z.object({});

export function createListContactsTool(agentId: string) {
  return createTool({
    id: 'list_contacts',
    description: 'List the known contacts registered by this agent.',
    inputSchema: listContactsInputSchema,
    execute: async () => {
      const contacts = await agentContacts.listAgentContacts(agentId);

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
