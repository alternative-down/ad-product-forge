import 'dotenv/config';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { Mastra } from '@mastra/core';
import { ConsoleLogger } from '@mastra/core/logger';
import { LocalFilesystem, LocalSandbox, Workspace } from '@mastra/core/workspace';
import {
  CLAUDE_MAX_MODELS,
  OPENAI_CODEX_MODELS,
  claudeMaxProvider,
  createForgeAgent,
  createInternalChatPreset,
  createOAuthGateway,
  createSimpleAgent,
  openaiCodexProvider,
} from '@mastra-engine/core';

import { createDiscordProvider } from './discord-account.js';
import { z } from 'zod';

const envSchema = z.object({
  FORGE_MODEL_PROVIDER: z.enum(['openai-codex', 'claude-max']),
  FORGE_MODEL_ID: z.string().min(1),
  FORGE_AGENT_ID: z.string().min(1),
  FORGE_AGENT_NAME: z.string().min(1),
  DISCORD_BOT_TOKEN: z.string().min(1),
  FORGE_HELPER_AGENT_ID: z.string().optional(),
  FORGE_HELPER_AGENT_NAME: z.string().optional(),
  DISCORD_ALLOWED_CHANNEL_IDS: z.string().optional(),
  DISCORD_RESPOND_TO_MENTIONS_ONLY: z.string().optional(),
  FORGE_LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional(),
});

export async function main() {
  const env = envSchema.parse(process.env);
  const systemPrompt = await readFile(path.resolve(import.meta.dirname, './forge-system.md'), 'utf8');
  const workspace = new Workspace({
    autoSync: true,
    bm25: true,
    filesystem: new LocalFilesystem({ basePath: './workspace-discord' }),
    sandbox: new LocalSandbox({ workingDirectory: './workspace-discord' }),
  });
  const helperAgentId = env.FORGE_HELPER_AGENT_ID?.trim() || 'forge-helper';
  const helperAgentName = env.FORGE_HELPER_AGENT_NAME?.trim() || 'Forge Helper';
  const helperInstructions = [
    systemPrompt,
    'You are the helper agent for the main Forge agent.',
    'You do not have direct external channels of your own except internal-chat.',
    'When the main agent contacts you through internal-chat, help with analysis, planning, review, and focused execution support.',
    'Reply through internal-chat when appropriate.',
  ].join('\n\n');

  await workspace.init();

  const internalChat = createInternalChatPreset();

  const model =
    env.FORGE_MODEL_PROVIDER === 'openai-codex'
      ? openaiCodexProvider(z.enum(OPENAI_CODEX_MODELS).parse(env.FORGE_MODEL_ID))
      : claudeMaxProvider(z.enum(CLAUDE_MAX_MODELS).parse(env.FORGE_MODEL_ID));

  const agent = await createForgeAgent({
    id: env.FORGE_AGENT_ID,
    name: env.FORGE_AGENT_NAME,
    instructions: systemPrompt,
    model,
    workspace,
    providers: [
      internalChat.createProvider({ id: env.FORGE_AGENT_ID, displayName: env.FORGE_AGENT_NAME }),
      createDiscordProvider({
        token: env.DISCORD_BOT_TOKEN,
        allowedChannelIds: (env.DISCORD_ALLOWED_CHANNEL_IDS ?? '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        respondToMentionsOnly: env.DISCORD_RESPOND_TO_MENTIONS_ONLY !== 'false',
      }),
    ],
  });
  const helperAgent = await createSimpleAgent({
    id: helperAgentId,
    name: helperAgentName,
    instructions: helperInstructions,
    model,
    providers: [internalChat.createProvider({ id: helperAgentId, displayName: helperAgentName })],
  });
  new Mastra({
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

}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
