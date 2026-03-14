import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

const accountSchema = z.object({
  accountId: z.string(),
  agentId: z.string(),
  provider: z.string(),
  externalAccountId: z.string(),
  displayName: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const contactIdentitySchema = z.object({
  provider: z.string(),
  externalUserId: z.string().optional(),
  username: z.string().optional(),
});

const contactSchema = z.object({
  agentId: z.string(),
  slug: z.string(),
  displayName: z.string(),
  description: z.string().optional(),
  accounts: z.array(contactIdentitySchema).default([]),
});

const attachmentSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  url: z.string(),
  contentType: z.string().optional(),
  sizeBytes: z.number().optional(),
  description: z.string().optional(),
});

const storedMessageSchema = z.object({
  messageId: z.string(),
  accountId: z.string(),
  direction: z.enum(['inbound', 'outbound']),
  channelId: z.string().optional(),
  channelName: z.string().optional(),
  authorId: z.string().optional(),
  authorName: z.string().optional(),
  username: z.string().optional(),
  content: z.string(),
  attachments: z.array(attachmentSchema).default([]),
  unread: z.boolean(),
  createdAt: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const stateSchema = z.object({
  accounts: z.array(accountSchema).default([]),
  contacts: z.array(contactSchema).default([]),
  messages: z.array(storedMessageSchema).default([]),
});

export type Account = z.infer<typeof accountSchema>;
export type ContactIdentity = z.infer<typeof contactIdentitySchema>;
export type Contact = z.infer<typeof contactSchema>;
export type Attachment = z.infer<typeof attachmentSchema>;
export type StoredMessage = z.infer<typeof storedMessageSchema>;
export type CommunicationState = z.infer<typeof stateSchema>;

export function createCommunicationState() {
  const statePath = path.resolve('.forge-state', 'accounts.json');
  let currentState: CommunicationState | null = null;

  async function read() {
    if (currentState) {
      return currentState;
    }

    try {
      const content = await readFile(statePath, 'utf8');
      currentState = stateSchema.parse(JSON.parse(content));
    } catch {
      currentState = stateSchema.parse({});
    }

    return currentState;
  }

  async function save() {
    if (!currentState) {
      return;
    }

    await mkdir(path.dirname(statePath), { recursive: true });
    await writeFile(statePath, JSON.stringify(currentState, null, 2), 'utf8');
  }

  return {
    read,
    save,
  };
}

export const communicationState = createCommunicationState();
