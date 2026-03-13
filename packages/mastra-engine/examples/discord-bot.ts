import 'dotenv/config';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { Mastra } from '@mastra/core';
import { ConsoleLogger } from '@mastra/core/logger';
import { createDiscordAgentClient } from '../src/discord/create-discord-agent-client';
import { createForgeAgent } from '../src/agents/create-forge-agent';
import { createSimpleAgent } from '../src/agents/create-simple-agent';
import { claudeMaxProvider } from '../src/providers/claude-max';
import { openaiCodexProvider } from '../src/providers/openai-codex';
import type { ClaudeMaxModelId, OpenAICodexModelId } from '../src/providers/model-ids';
import { LocalFilesystem, LocalSandbox, Workspace } from '@mastra/core/workspace';
import { createExternalAccountTools } from '../src/tools/external-accounts';
import { createInternalChatRouter } from '../src/internal-chat/create-internal-chat-router';

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function parseAllowedChannelIds(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveModel() {
  const provider = getRequiredEnv('FORGE_MODEL_PROVIDER');
  const modelId = getRequiredEnv('FORGE_MODEL_ID');

  switch (provider) {
    case 'openai-codex':
      return openaiCodexProvider(modelId as OpenAICodexModelId);
    case 'claude-max':
      return claudeMaxProvider(modelId as ClaudeMaxModelId);
    default:
      throw new Error(
        `Unsupported FORGE_MODEL_PROVIDER: ${provider}. Use "openai-codex" or "claude-max".`,
      );
  }
}

async function main() {
  const systemPromptPath = path.resolve(__dirname, '../src/presets/forge/SYSTEM_FINAL.md');
  const systemPrompt = await readFile(systemPromptPath, 'utf8');

  const workspace = new Workspace({
    autoSync: true,
    bm25: true,
    filesystem: new LocalFilesystem({ basePath: './workspace-discord' }),
    sandbox: new LocalSandbox({ workingDirectory: './workspace-discord' }),
  });
  await workspace.init();

  const agent = await createForgeAgent({
    id: getRequiredEnv('FORGE_AGENT_ID'),
    name: getRequiredEnv('FORGE_AGENT_NAME'),
    instructions: systemPrompt,
    model: resolveModel(),
    tools: createExternalAccountTools(getRequiredEnv('FORGE_AGENT_ID')),
    workspace,
  });

  const helperAgent = await createSimpleAgent({
    id: process.env.FORGE_HELPER_AGENT_ID?.trim() || 'forge-helper',
    name: process.env.FORGE_HELPER_AGENT_NAME?.trim() || 'Forge Helper',
    instructions: [
      systemPrompt,
      'You are the helper agent for the main Forge agent.',
      'You do not have direct external channels of your own except internal-chat.',
      'When the main agent contacts you through internal-chat, help with analysis, planning, review, and focused execution support.',
      'Reply through internal-chat when appropriate.',
    ].join('\n\n'),
    model: resolveModel(),
    tools: createExternalAccountTools(process.env.FORGE_HELPER_AGENT_ID?.trim() || 'forge-helper'),
  });

  new Mastra({
    agents: {
      [String(agent.id)]: agent,
      [String(helperAgent.id)]: helperAgent,
    },
    logger: new ConsoleLogger({
      name: 'forge-app',
      level: (process.env.FORGE_LOG_LEVEL?.trim() || 'warn') as 'debug' | 'info' | 'warn' | 'error',
    }),
  });

  const internalChat = createInternalChatRouter();
  await internalChat.registerAgent({ agent });
  await internalChat.registerAgent({ agent: helperAgent });

  await createDiscordAgentClient({
    agent,
    token: getRequiredEnv('DISCORD_BOT_TOKEN'),
    allowedChannelIds: parseAllowedChannelIds(process.env.DISCORD_ALLOWED_CHANNEL_IDS),
    respondToMentionsOnly: process.env.DISCORD_RESPOND_TO_MENTIONS_ONLY !== 'false',
  });
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
