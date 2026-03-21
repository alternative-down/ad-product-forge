import { z } from 'zod';

import type { CommunicationProvider } from '@mastra-engine/core';
import { createDiscordProvider } from '../discord-account.js';
import { createEmailProvider } from '../email-account.js';
import { createInternalChatPreset } from './presets/internal-chat.js';

const internalChatCredentialsSchema = z.object({
  agentId: z.string(),
  displayName: z.string().min(1).optional(),
  description: z.string().optional(),
});

const discordCredentialsSchema = z.object({
  token: z.string(),
  allowedChannelIds: z.array(z.string()).optional(),
  respondToMentionsOnly: z.boolean().optional(),
});

const emailCredentialsSchema = z.object({
  imap: z.object({
    host: z.string(),
    port: z.number(),
    secure: z.boolean(),
    user: z.string(),
    password: z.string(),
  }),
  smtp: z.object({
    host: z.string(),
    port: z.number(),
    secure: z.boolean(),
    user: z.string(),
    password: z.string(),
  }),
  bcc: z.string().optional(),
});

export type ProviderCredentialsMap = {
  'internal-chat'?: { agentId: string; displayName?: string; description?: string };
  discord?: {
    token: string;
    allowedChannelIds?: string[];
    respondToMentionsOnly?: boolean;
  };
  email?: {
    imap: { host: string; port: number; secure: boolean; user: string; password: string };
    smtp: { host: string; port: number; secure: boolean; user: string; password: string };
    bcc?: string;
  };
};

// Global internal chat preset instance (singleton)
const internalChatPreset = createInternalChatPreset();

/**
 * Load communication providers from credentials map
 * Supports: internal-chat (preset), email (IMAP/SMTP)
 */
export function loadCommunicationProviders(credentials: ProviderCredentialsMap): CommunicationProvider[] {
  const providers: CommunicationProvider[] = [];

  if (credentials['internal-chat']) {
    const { agentId, displayName, description } = internalChatCredentialsSchema.parse(credentials['internal-chat']);
    providers.push(
      internalChatPreset.createProvider({
        id: agentId,
        displayName: displayName ?? agentId,
        description,
      })
    );
  }

  if (credentials.discord) {
    const discord = discordCredentialsSchema.parse(credentials.discord);
    providers.push(createDiscordProvider(discord));
  }

  if (credentials.email) {
    providers.push(createEmailProvider(emailCredentialsSchema.parse(credentials.email)));
  }

  return providers;
}
