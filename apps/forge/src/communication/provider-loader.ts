import { z } from 'zod';

import { forgeDebug } from '@forge-runtime/core';
import type { CommunicationProvider } from '@forge-runtime/core';
import { createDiscordProvider } from '../discord-account';
import { createEmailProvider } from '../email-account';
import { createInternalChatProvider } from './internal-chat-provider';
import type { InternalChatService } from './internal-chat-service';

const internalChatCredentialsSchema = z.object({
  agentId: z.string(),
  displayName: z.string().min(1).nullish(),
  description: z.string().nullish(),
});

const discordChannelCredentialsSchema = z.object({
  token: z.string(),
  channels: z
    .array(
      z.object({
        channelId: z.string(),
        channelName: z.string().nullish(),
        respondToMentionsOnly: z.boolean(),
      }),
    )
    .nullish(),
});

const discordLegacyCredentialsSchema = z.object({
  token: z.string(),
  allowedChannelIds: z.array(z.string()).nullish(),
  respondToMentionsOnly: z.boolean().nullish(),
});

const discordCredentialsSchema = z
  .union([discordChannelCredentialsSchema, discordLegacyCredentialsSchema])
  .transform((credentials) => {
    if ('allowedChannelIds' in credentials || 'respondToMentionsOnly' in credentials) {
      return {
        token: credentials.token,
        channels: (credentials.allowedChannelIds ?? []).map((channelId) => ({
          channelId,
          channelName: '',
          respondToMentionsOnly: credentials.respondToMentionsOnly ?? false,
        })),
      };
    }

    const channelCredentials = discordChannelCredentialsSchema.parse(credentials);

    return {
      token: channelCredentials.token,
      channels: (channelCredentials.channels ?? []).map((channel) => ({
        channelId: channel.channelId,
        channelName: channel.channelName ?? undefined,
        respondToMentionsOnly: channel.respondToMentionsOnly,
      })),
    };
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
  bcc: z.string().nullish(),
});

export type ProviderCredentialsMap = {
  'internal-chat'?: { agentId: string; displayName?: string; description?: string };
  discord?: {
    token: string;
    channels?: Array<{
      channelId: string;
      channelName?: string;
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
export async function loadCommunicationProviders(
  credentials: ProviderCredentialsMap,
  config?: {
    internalChat: InternalChatService;
  },
): Promise<CommunicationProvider[]> {
  const providers: CommunicationProvider[] = [];

  if (credentials['internal-chat']) {
    const internalChat = internalChatCredentialsSchema.parse(credentials['internal-chat']);

    if (!config?.internalChat) {
      forgeDebug({
        scope: 'provider-loader',
        level: 'error',
        message: 'loadProvider: internalChat service required',
      });
      throw new Error('Internal chat provider requires the internalChat service');
    }

    providers.push(
      createInternalChatProvider({
        agentId: internalChat.agentId,
        internalChat: config.internalChat,
      }),
    );
  }

  if (credentials.discord) {
    try {
      const discord = discordCredentialsSchema.parse(credentials.discord);
      const provider = createDiscordProvider({
        token: discord.token,
        channels: discord.channels ?? undefined,
      });

      await provider.getSelfContact?.();

      providers.push(provider);
    } catch (error) {
      forgeDebug({
        scope: 'provider-loader',
        level: 'warn',
        message: 'Skipping Discord provider because it failed to start',
        context: { error: errorMsg(error) },
      });
    }
  }

  if (credentials.email) {
    try {
      const email = emailCredentialsSchema.parse(credentials.email);
      providers.push(
        createEmailProvider({
          imap: email.imap,
          smtp: email.smtp,
          bcc: email.bcc ?? undefined,
        }),
      );
    } catch (error) {
      forgeDebug({
        scope: 'provider-loader',
        level: 'error',
        message: 'Failed to load email provider',
        context: { error: errorMsg(error) },
      });
      throw error;
    }
  }

  return providers;
}
import { serializeError, errorMsg } from '../agents/agent-runner-error-formatting';

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
