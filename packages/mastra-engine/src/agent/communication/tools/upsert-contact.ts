import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import type { CommunicationModule } from '../module';

const upsertContactInputSchema = z.object({
  slug: z.string().describe('A stable slug to identify this contact later.'),
  displayName: z.string().describe('The human-readable name of the contact.'),
  description: z.string().nullish().describe('Optional notes or description about this contact.'),
});

export function createUpsertContactTool(communication: CommunicationModule) {
  return createTool({
    id: 'upsert_contact',
    description:
      'Create a new contact or update an existing one. Returns the saved slug, display name, and description.',
    inputSchema: upsertContactInputSchema,
    execute: async (input) => {
      try {
        const contact = await communication.upsertContact({
          slug: input.slug,
          displayName: input.displayName,
          description: input.description ?? undefined,
        });

        return {
          valid: true,
          slug: contact.slug,
          displayName: contact.displayName,
          description: contact.description,
        };
      } catch (error) {
        if (error instanceof Error) {
          return {
            valid: false,
            error: error.message,
            hint: 'Verify the slug is valid and does not contain special characters. The slug should be a stable identifier (e.g., "john-doe" or "john@example.com").',
          };
        }
        return {
          valid: false,
          error: 'An unknown error occurred while upserting the contact',
          hint: 'Verify the slug and displayName are valid.',
        };
      }
    },
  });
}
