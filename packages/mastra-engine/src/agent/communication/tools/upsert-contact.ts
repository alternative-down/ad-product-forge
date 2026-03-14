import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { communicationModule } from '../module';

const upsertContactInputSchema = z.object({
  slug: z.string(),
  displayName: z.string(),
  description: z.string().optional(),
});

export function createUpsertContactTool(agentId: string) {
  return createTool({
    id: 'upsert_contact',
    description:
      'Create or update a contact with a stable slug, display name, and free-form description.',
    inputSchema: upsertContactInputSchema,
    execute: async (input) => {
      const contact = await communicationModule.upsertContact({
        agentId,
        slug: input.slug,
        displayName: input.displayName,
        description: input.description,
      });

      return {
        slug: contact.slug,
        displayName: contact.displayName,
        description: contact.description,
      };
    },
  });
}
