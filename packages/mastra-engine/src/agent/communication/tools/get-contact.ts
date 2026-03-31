import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import type { CommunicationModule } from '../module';

const getContactInputSchema = z.object({
  slug: z.string(),
});

export function createGetContactTool(communication: CommunicationModule) {
  return createTool({
    id: 'get_contact',
    description: 'Get a registered contact by slug, including the provider accounts linked to that contact.',
    inputSchema: getContactInputSchema,
    execute: async (input) => {
      try {
        return {
          contact: await communication.getContact(input.slug),
        };
      } catch (error) {
        if (error instanceof Error) {
          return {
            valid: false,
            error: error.message,
            hint: 'Use list_contacts to confirm the slug is correct before calling get_contact.',
          };
        }
        return {
          valid: false,
          error: 'An unknown error occurred while fetching the contact',
          hint: 'Use list_contacts to confirm the slug is correct before calling get_contact.',
        };
      }
    },
  });
}
