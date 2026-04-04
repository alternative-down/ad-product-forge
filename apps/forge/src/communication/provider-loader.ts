import { z } from 'zod';

import type { CommunicationProvider } from '@mastra-engine/core';
import { createDiscordProvider } from '../discord-account';
import { createEmailProvider } from '../email-account';
import { createInternalChatProvider } from './internal-chat-provider';
import type { InternalChatService } from './internal-chat-service';

export const internalChatCredentialsSchema = z.object({
  agentId: z.string(),
  displayName: z.string().min(1).nullish(),
  description: z.string().nullish(),
});

export const discordCredentialsSchema = z.object({
  token: z.string(),
  channels: z.array(
    z.object({
      channelId: z.string(),
      respondToMentionsOnly: z.boolean(),
    }),
  ).nullish(),
});

export const emailCredentialsSchema = z.object({
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
  bcc: z.string().nullish(),
});

export type ProviderCredentialsMap = {
  'internal-chat'?: { agentId: string; displayName?: string; description?: string };
  discord?: {
    token: string;
    channels?: Array<{
      channelId: string;
      respondToMentionsOnly: boolean;
    }>;
  };
  email?: {
    imap: { host: string; port: number; secure: boolean; user: string; password: string };
    smtp: { host: string; port: number; secure: boolean; user: string; password: string };
    bcc?: string;
  };
};

/**
 * Load communication providers from credentials map.
 */
export function loadCommunicationProviders(
  credentials: ProviderCredentialsMap,
  config?: {
    internalChat: InternalChatService;
  },
): CommunicationProvider[] {
  const providers: CommunicationProvider[] = [];

  if (credentials['internal-chat']) {
    const internalChat = internalChatCredentialsSchema.parse(credentials['internal-chat']);

    if (!config?.internalChat) {
      throw new Error('Internal chat provider requires the internalChat service');
    }

    providers.push(createInternalChatProvider({
      agentId: internalChat.agentId,
      internalChat: config.internalChat,
    }));
  }

  if (credentials.discord) {
    const discord = discordCredentialsSchema.parse(credentials.discord);
    providers.push(
      createDiscordProvider({
        token: discord.token,
        channels: discord.channels ?? undefined,
      })
    );
  }

  if (credentials.email) {
    const email = emailCredentialsSchema.parse(credentials.email);
    providers.push(
      createEmailProvider({
        imap: email.imap,
        smtp: email.smtp,
        bcc: email.bcc ?? undefined,
      })
    );
  }

  return providers;
}

export function parseProviderCredentials(
  providerType: keyof ProviderCredentialsMap,
  credentials: unknown,
) {
  if (providerType === 'internal-chat') {
    return internalChatCredentialsSchema.parse(credentials);
  }

  if (providerType === 'discord') {
    return discordCredentialsSchema.parse(credentials);
  }

  return emailCredentialsSchema.parse(credentials);
}
