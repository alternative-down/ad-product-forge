import { z } from 'zod';

import type { RuntimeActionDefinition } from 'agent-runtime-core/integrations';

import type { CommunicationModule } from './communication.js';

export function createExternalCommunicationActions(
  communication: CommunicationModule,
): Array<RuntimeActionDefinition<Record<string, unknown>, unknown>> {
  return [
    {
      name: 'list_contacts',
      description: 'List available communication contacts and self accounts.',
      inputSchema: z.object({
        filter: z.enum(['self', 'others', 'all']).optional(),
      }) as unknown as RuntimeActionDefinition<Record<string, unknown>, unknown>['inputSchema'],
      async execute(input) {
        return communication.listContacts(
          input.filter === 'self' || input.filter === 'others' || input.filter === 'all'
            ? input.filter
            : undefined,
        );
      },
    },
    {
      name: 'upsert_contact',
      description: 'Create or update a communication contact.',
      inputSchema: z.object({
        slug: z.string().min(1),
        displayName: z.string().min(1),
        description: z.string().optional(),
      }) as unknown as RuntimeActionDefinition<Record<string, unknown>, unknown>['inputSchema'],
      async execute(input) {
        return communication.upsertContact({
          slug: String(input.slug),
          displayName: String(input.displayName),
          description: typeof input.description === 'string' ? input.description : undefined,
        });
      },
    },
    {
      name: 'list_conversations',
      description: 'List communication conversations.',
      inputSchema: z.object({
        provider: z.string().optional(),
        unread: z.boolean().optional(),
        limit: z.number().int().positive().default(20),
      }) as unknown as RuntimeActionDefinition<Record<string, unknown>, unknown>['inputSchema'],
      async execute(input) {
        return communication.listConversations({
          provider: typeof input.provider === 'string' ? input.provider : undefined,
          unread: typeof input.unread === 'boolean' ? input.unread : undefined,
          limit: Number(input.limit),
        });
      },
    },
    {
      name: 'get_messages',
      description: 'Read messages from a communication conversation.',
      inputSchema: z.object({
        provider: z.string().min(1),
        targetKey: z.string().min(1),
        limit: z.number().int().positive().default(50),
        offset: z.number().int().nonnegative().default(0),
        query: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
      }) as unknown as RuntimeActionDefinition<Record<string, unknown>, unknown>['inputSchema'],
      async execute(input) {
        return communication.getMessages({
          provider: String(input.provider),
          targetKey: String(input.targetKey),
          limit: Number(input.limit),
          offset: Number(input.offset),
          query: typeof input.query === 'string' ? input.query : undefined,
          dateFrom: typeof input.dateFrom === 'string' ? input.dateFrom : undefined,
          dateTo: typeof input.dateTo === 'string' ? input.dateTo : undefined,
        });
      },
    },
    {
      name: 'send_message',
      description: 'Send a message through a communication provider.',
      inputSchema: z.object({
        provider: z.string().min(1),
        targetKey: z.string().min(1),
        content: z.string().min(1),
        attachmentPaths: z.array(z.string().min(1)).optional(),
      }) as unknown as RuntimeActionDefinition<Record<string, unknown>, unknown>['inputSchema'],
      async execute(input) {
        return communication.sendMessage({
          provider: String(input.provider),
          targetKey: String(input.targetKey),
          content: String(input.content),
          attachmentPaths: Array.isArray(input.attachmentPaths)
            ? input.attachmentPaths.map((value) => String(value))
            : undefined,
        });
      },
    },
  ];
}
