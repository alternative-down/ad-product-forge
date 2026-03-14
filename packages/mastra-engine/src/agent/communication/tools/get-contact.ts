import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { communicationModule } from '../module';

const getContactInputSchema = z.object({
  slug: z.string(),
});

export function createGetContactTool(agentId: string) {
  return createTool({
    id: 'get_contact',
    description:
      'Get a registered contact by slug, including all known identities across providers.',
    inputSchema: getContactInputSchema,
    execute: async (input) => ({
      contact: await communicationModule.getContact(agentId, input.slug),
    }),
  });
}
