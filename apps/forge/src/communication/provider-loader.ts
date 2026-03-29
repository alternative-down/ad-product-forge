import path from 'node:path';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';

import type { CommunicationProvider } from '@mastra-engine/core';
import { communicationSchema } from '@mastra-engine/core';
import { createDiscordProvider } from '../discord-account';
import { createEmailProvider } from '../email-account';
import { createInternalChatPreset } from './presets/internal-chat';

const { chatGroupMembers } = communicationSchema;

// Global internal chat preset instance (singleton)
const internalChatPreset = createInternalChatPreset();

export const internalChatCredentialsSchema = z.object({
  agentId: z.string(),
  displayName: z.string().min(1).nullish(),
  description: z.string().nullish(),
});

export const discordCredentialsSchema = z.object({
  token: z.string(),
  allowedChannelIds: z.array(z.string()).nullish(),
  respondToMentionsOnly: z.boolean().nullish(),
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
    allowedChannelIds?: string[];
    respondToMentionsOnly?: boolean;
  };
  email?: {
    imap: { host: string; port: number; secure: boolean; user: string; password: string };
    smtp: { host: string; port: number; secure: boolean; user: string; password: string };
    bcc?: string;
  };
};

export interface ProviderLoaderConfig {
  workspaceBasePath: string;
  propagateMessage?: (instanceId: string, message: unknown) => Promise<{ success: boolean; error?: string }>;
}

/**
 * Create a getGroupMembers function that queries the agent's workspace database
 */
function createGroupMembersGetter(workspaceBasePath: string, agentId: string) {
  return async (groupId: string) => {
    try {
      const agentDatabasePath = path.resolve(workspaceBasePath, agentId, 'database.db');
      const client = createClient({
        url: `file:${agentDatabasePath}`,
      });
      const db = drizzle(client, { schema: communicationSchema });

      const members = await db.query.chatGroupMembers.findMany({
        where: eq(chatGroupMembers.groupId, groupId),
        orderBy: [chatGroupMembers.createdAt],
      });

      return members.map((member) => ({
        id: member.participantId,
        displayName: member.participantName,
        instanceId: member.instanceId ?? null,
      }));
    } catch (error) {
      console.error(`[ProviderLoader] Failed to list group members for group ${groupId}:`, error);
      return [];
    }
  };
}

/**
 * Load communication providers from credentials map
 * Supports: internal-chat (preset), email (IMAP/SMTP)
 */
export function loadCommunicationProviders(
  credentials: ProviderCredentialsMap,
  config?: ProviderLoaderConfig
): CommunicationProvider[] {
  const providers: CommunicationProvider[] = [];

  if (credentials['internal-chat']) {
    const { agentId, displayName, description } = internalChatCredentialsSchema.parse(credentials['internal-chat']);

    const providerConfig: {
      id: string;
      displayName: string;
      description?: string;
      getGroupMembers?: (groupId: string) => Promise<{ id: string; displayName: string; instanceId: string | null }[]>;
      propagateMessage?: (instanceId: string, message: unknown) => Promise<{ success: boolean; error?: string }>;
    } = {
      id: agentId,
      displayName: displayName ?? agentId,
      description: description ?? undefined,
    };

    // Only add getGroupMembers if we have workspace config
    if (config?.workspaceBasePath) {
      providerConfig.getGroupMembers = createGroupMembersGetter(config.workspaceBasePath, agentId);
    }

    // Add propagateMessage if configured (for cross-instance fan-out)
    if (config?.propagateMessage) {
      providerConfig.propagateMessage = config.propagateMessage;
    }

    providers.push(internalChatPreset.createProvider(providerConfig));
  }

  if (credentials.discord) {
    const discord = discordCredentialsSchema.parse(credentials.discord);
    providers.push(
      createDiscordProvider({
        token: discord.token,
        allowedChannelIds: discord.allowedChannelIds ?? undefined,
        respondToMentionsOnly: discord.respondToMentionsOnly ?? undefined,
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
