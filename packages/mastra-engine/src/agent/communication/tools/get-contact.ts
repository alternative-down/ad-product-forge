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
    execute: async (input) => ({
      contact: await communication.getContact(input.slug),
    }),
  });
}
