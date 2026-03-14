import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

const stateDir = '.forge-state';
const stateFile = 'accounts.json';

export const accountSchema = z.object({
  accountId: z.string(),
  agentId: z.string(),
  provider: z.string(),
  externalAccountId: z.string(),
  displayName: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const contactIdentitySchema = z.object({
  provider: z.string(),
  externalUserId: z.string().optional(),
  username: z.string().optional(),
});

export const contactSchema = z.object({
  agentId: z.string(),
  slug: z.string(),
  displayName: z.string(),
  description: z.string().optional(),
  accounts: z.array(contactIdentitySchema).default([]),
});

export const attachmentSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  url: z.string(),
  contentType: z.string().optional(),
  sizeBytes: z.number().optional(),
  description: z.string().optional(),
});

export const messageSchema = z.object({
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
  messages: z.array(messageSchema).default([]),
});

export type State = z.infer<typeof stateSchema>;
export type ContactIdentity = z.infer<typeof contactIdentitySchema>;
export type StoredMessage = z.infer<typeof messageSchema>;
export type StoredAttachment = z.infer<typeof attachmentSchema>;

function createMessageState() {
  let currentState: State | null = null;

  async function readStateFile() {
    const filePath = path.resolve(stateDir, stateFile);

    try {
      const content = await readFile(filePath, 'utf8');
      return stateSchema.parse(JSON.parse(content));
    } catch {
      return stateSchema.parse({});
    }
  }

  async function load() {
    if (!currentState) {
      currentState = await readStateFile();
    }

    return currentState;
  }

  async function save(state: State) {
    const filePath = path.resolve(stateDir, stateFile);
    await mkdir(path.resolve(stateDir), { recursive: true });
    await writeFile(filePath, JSON.stringify(state, null, 2), 'utf8');
  }

  async function update<T>(handler: (state: State) => Promise<T> | T) {
    const state = await load();
    const result = await handler(state);
    await save(state);
    return result;
  }

  return {
    load,
    update,
  };
}

export const messageState = createMessageState();
