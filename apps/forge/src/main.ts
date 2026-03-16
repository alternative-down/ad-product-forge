import 'dotenv/config';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { Mastra } from '@mastra/core';
import { ConsoleLogger } from '@mastra/core/logger';
import {
  CLAUDE_MAX_MODELS,
  OPENAI_CODEX_MODELS,
  createForgeAgent,
  createInternalChatPreset,
  createOAuthGateway,
  createSimpleAgent,
  OAUTH_GATEWAY_ID,
} from '@mastra-engine/core';

import { createDiscordProvider } from './discord-account.js';
import { createEmailProvider } from './email-account.js';
import { z } from 'zod';

const envSchema = z.object({
  FORGE_MODEL_PROVIDER: z.enum(['openai-codex', 'claude-max']),
  FORGE_MODEL_ID: z.string().min(1),
  FORGE_AGENT_ID: z.string().min(1),
  FORGE_AGENT_NAME: z.string().min(1),
  FORGE_HELPER_AGENT_ID: z.string().optional(),
  FORGE_HELPER_AGENT_NAME: z.string().optional(),
  FORGE_LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional(),
  // Discord provider (optional)
  DISCORD_BOT_TOKEN: z.string().optional(),
  DISCORD_ALLOWED_CHANNEL_IDS: z.string().optional(),
  DISCORD_RESPOND_TO_MENTIONS_ONLY: z.string().optional(),
  // Email provider (optional)
  IMAP_HOST: z.string().optional(),
  IMAP_PORT: z.string().optional(),
  IMAP_USER: z.string().optional(),
  IMAP_PASSWORD: z.string().optional(),
  IMAP_SECURE: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_SECURE: z.string().optional(),
  FORGE_EMAIL_BCC: z.string().optional(),
});

export async function main() {
  const env = envSchema.parse(process.env);
  const systemPrompt = await readFile(path.resolve(import.meta.dirname, './forge-system.md'), 'utf8');
  const helperAgentId = env.FORGE_HELPER_AGENT_ID?.trim() || 'forge-helper';
  const helperAgentName = env.FORGE_HELPER_AGENT_NAME?.trim() || 'Forge Helper';
  const helperInstructions = [
    systemPrompt,
    'You are the helper agent for the main Forge agent.',
    'You do not have direct external channels of your own except internal-chat.',
    'When the main agent contacts you through internal-chat, help with analysis, planning, review, and focused execution support.',
    'Reply through internal-chat when appropriate.',
  ].join('\n\n');

  const internalChat = createInternalChatPreset();

  const model =
    env.FORGE_MODEL_PROVIDER === 'openai-codex'
      ? `${OAUTH_GATEWAY_ID}/openai-codex/${z.enum(OPENAI_CODEX_MODELS).parse(env.FORGE_MODEL_ID)}`
      : `${OAUTH_GATEWAY_ID}/claude-max/${z.enum(CLAUDE_MAX_MODELS).parse(env.FORGE_MODEL_ID)}`;

  // Build providers array - internalChat is always included
  const providers = [internalChat.createProvider({ id: env.FORGE_AGENT_ID, displayName: env.FORGE_AGENT_NAME })];

  // Add Discord provider if DISCORD_BOT_TOKEN is set
  if (env.DISCORD_BOT_TOKEN) {
    providers.push(
      createDiscordProvider({
        token: env.DISCORD_BOT_TOKEN,
        allowedChannelIds: (env.DISCORD_ALLOWED_CHANNEL_IDS ?? '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        respondToMentionsOnly: env.DISCORD_RESPOND_TO_MENTIONS_ONLY !== 'false',
      }),
    );
  }

  // Add Email provider if both IMAP_HOST and SMTP_HOST are set
  if (env.IMAP_HOST && env.SMTP_HOST) {
    providers.push(
      createEmailProvider({
        imap: {
          host: env.IMAP_HOST,
          port: Number(env.IMAP_PORT ?? 993),
          secure: env.IMAP_SECURE !== 'false',
          user: env.IMAP_USER!,
          password: env.IMAP_PASSWORD!,
        },
        smtp: {
          host: env.SMTP_HOST,
          port: Number(env.SMTP_PORT ?? 587),
          secure: env.SMTP_SECURE === 'true',
          user: env.SMTP_USER!,
          password: env.SMTP_PASSWORD!,
        },
        bcc: env.FORGE_EMAIL_BCC,
      }),
    );
  }

  const agent = await createForgeAgent({
    id: env.FORGE_AGENT_ID,
    name: env.FORGE_AGENT_NAME,
    instructions: systemPrompt,
    model,
    providers,
  });
  const helperAgent = await createSimpleAgent({
    id: helperAgentId,
    name: helperAgentName,
    instructions: helperInstructions,
    model,
    providers: [internalChat.createProvider({ id: helperAgentId, displayName: helperAgentName })],
  });
  const mastra = new Mastra({
    agents: {
      [String(agent.id)]: agent,
      [String(helperAgent.id)]: helperAgent,
    },
    gateways: {
      oauth: createOAuthGateway(),
    },
    logger: new ConsoleLogger({
      name: 'forge-app',
      level: env.FORGE_LOG_LEVEL ?? 'warn',
    }),
  });

  // Graceful shutdown handlers
  const handleShutdown = (signal: string) => {
    console.log(`\n[${signal}] Shutting down gracefully...`);
    process.exit(0);
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));

}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
