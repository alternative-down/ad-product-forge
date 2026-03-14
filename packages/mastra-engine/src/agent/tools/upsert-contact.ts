import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { agentContacts } from '../agent-contacts';

const upsertContactInputSchema = z.object({
  slug: z.string(),
  displayName: z.string(),
  description: z.string().optional(),
  accounts: z
    .array(
      z.object({
        provider: z.string(),
        externalUserId: z.string().optional(),
        username: z.string().optional(),
      }),
    )
    .default([]),
});

export function createUpsertContactTool(agentId: string) {
  return createTool({
    id: 'upsert_contact',
    description:
      'Create or update a contact with a stable slug, free-form description, and known accounts.',
    inputSchema: upsertContactInputSchema,
    execute: async (input) => {
      const contact = await agentContacts.upsertAgentContact({
        agentId,
        slug: input.slug,
        displayName: input.displayName,
        description: input.description,
        accounts: input.accounts,
      });

      return {
        slug: contact.slug,
        displayName: contact.displayName,
        description: contact.description,
      };
    },
  });
}
