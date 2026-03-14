import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import type { CommunicationModule } from '../module';

const upsertContactInputSchema = z.object({
  slug: z.string(),
  displayName: z.string(),
  description: z.string().optional(),
});

export function createUpsertContactTool(communication: CommunicationModule) {
  return createTool({
    id: 'upsert_contact',
    description:
      'Create or update a contact with a stable slug, display name, and free-form description.',
    inputSchema: upsertContactInputSchema,
    execute: async (input) => {
      const contact = await communication.upsertContact({
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
