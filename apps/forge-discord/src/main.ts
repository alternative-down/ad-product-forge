import 'dotenv/config';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { Mastra } from '@mastra/core';
import { ConsoleLogger } from '@mastra/core/logger';
import { LocalFilesystem, LocalSandbox, Workspace } from '@mastra/core/workspace';
import {
  claudeMaxProvider,
  createDiscordAgentClient,
  createExternalAccountTools,
  createForgeAgent,
  createInternalChatRouter,
  createSimpleAgent,
  openaiCodexProvider,
  type ClaudeMaxModelId,
  type OpenAICodexModelId,
} from '@mastra-engine/core';

function resolveModel() {
  const provider = process.env.FORGE_MODEL_PROVIDER?.trim();
  const modelId = process.env.FORGE_MODEL_ID?.trim();

  if (!provider) {
    throw new Error('Missing required env var: FORGE_MODEL_PROVIDER');
  }

  if (!modelId) {
    throw new Error('Missing required env var: FORGE_MODEL_ID');
  }

  if (provider === 'openai-codex') {
    return openaiCodexProvider(modelId as OpenAICodexModelId);
  }

  if (provider === 'claude-max') {
    return claudeMaxProvider(modelId as ClaudeMaxModelId);
  }

  throw new Error(`Unsupported FORGE_MODEL_PROVIDER: ${provider}. Use "openai-codex" or "claude-max".`);
}

async function main() {
  const systemPromptPath = path.resolve(import.meta.dirname, './forge-system.md');
  const systemPrompt = await readFile(systemPromptPath, 'utf8');
  const model = resolveModel();
  const agentId = process.env.FORGE_AGENT_ID?.trim();
  const agentName = process.env.FORGE_AGENT_NAME?.trim();
  const discordBotToken = process.env.DISCORD_BOT_TOKEN?.trim();

  if (!agentId) {
    throw new Error('Missing required env var: FORGE_AGENT_ID');
  }

  if (!agentName) {
    throw new Error('Missing required env var: FORGE_AGENT_NAME');
  }

  if (!discordBotToken) {
    throw new Error('Missing required env var: DISCORD_BOT_TOKEN');
  }

  const helperAgentId = process.env.FORGE_HELPER_AGENT_ID?.trim() || 'forge-helper';
  const helperAgentName = process.env.FORGE_HELPER_AGENT_NAME?.trim() || 'Forge Helper';
  const helperInstructions = [
    systemPrompt,
    'You are the helper agent for the main Forge agent.',
    'You do not have direct external channels of your own except internal-chat.',
    'When the main agent contacts you through internal-chat, help with analysis, planning, review, and focused execution support.',
    'Reply through internal-chat when appropriate.',
  ].join('\n\n');

  const workspace = new Workspace({
    autoSync: true,
    bm25: true,
    filesystem: new LocalFilesystem({ basePath: './workspace-discord' }),
    sandbox: new LocalSandbox({ workingDirectory: './workspace-discord' }),
  });
  await workspace.init();

  const agent = await createForgeAgent({
    id: agentId,
    name: agentName,
    instructions: systemPrompt,
    model,
    tools: createExternalAccountTools(agentId),
    workspace,
  });

  const helperAgent = await createSimpleAgent({
    id: helperAgentId,
    name: helperAgentName,
    instructions: helperInstructions,
    model,
    tools: createExternalAccountTools(helperAgentId),
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
    token: discordBotToken,
    allowedChannelIds: (process.env.DISCORD_ALLOWED_CHANNEL_IDS ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
    respondToMentionsOnly: process.env.DISCORD_RESPOND_TO_MENTIONS_ONLY !== 'false',
  });
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
