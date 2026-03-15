import 'dotenv/config';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { Mastra } from '@mastra/core';
import { ConsoleLogger } from '@mastra/core/logger';
import { LocalFilesystem, LocalSandbox, Workspace } from '@mastra/core/workspace';
import {
  CLAUDE_MAX_MODELS,
  OPENAI_CODEX_MODELS,
  createForgeAgent,
  createInternalChatPreset,
  createOAuthGateway,
  createSimpleAgent,
  OAUTH_GATEWAY_ID,
} from '@mastra-engine/core';

import { createEmailProvider } from './email-account.js';
import { z } from 'zod';

const envSchema = z.object({
  FORGE_MODEL_PROVIDER: z.enum(['openai-codex', 'claude-max']),
  FORGE_MODEL_ID: z.string().min(1),
  FORGE_AGENT_ID: z.string().min(1),
  FORGE_AGENT_NAME: z.string().min(1),
  IMAP_HOST: z.string().min(1),
  IMAP_PORT: z.coerce.number(),
  IMAP_SECURE: z.string().transform(v => v !== 'false').default('true'),
  IMAP_USER: z.string().min(1),
  IMAP_PASSWORD: z.string().min(1),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number(),
  SMTP_SECURE: z.string().transform(v => v !== 'false').default('false'),
  SMTP_USER: z.string().min(1),
  SMTP_PASSWORD: z.string().min(1),
  FORGE_HELPER_AGENT_ID: z.string().optional(),
  FORGE_HELPER_AGENT_NAME: z.string().optional(),
  FORGE_LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional(),
});

export async function main() {
  const env = envSchema.parse(process.env);
  const systemPrompt = await readFile(path.resolve(import.meta.dirname, './forge-system.md'), 'utf8');
  const workspace = new Workspace({
    autoSync: true,
    bm25: true,
    filesystem: new LocalFilesystem({ basePath: path.resolve(process.cwd(), 'workspace-email') }),
    sandbox: new LocalSandbox({ workingDirectory: path.resolve(process.cwd(), 'workspace-email') }),
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
      ? `${OAUTH_GATEWAY_ID}/openai-codex/${z.enum(OPENAI_CODEX_MODELS).parse(env.FORGE_MODEL_ID)}`
      : `${OAUTH_GATEWAY_ID}/claude-max/${z.enum(CLAUDE_MAX_MODELS).parse(env.FORGE_MODEL_ID)}`;

  const agent = await createForgeAgent({
    id: env.FORGE_AGENT_ID,
    name: env.FORGE_AGENT_NAME,
    instructions: systemPrompt,
    model,
    workspace,
    providers: [
      internalChat.createProvider({ id: env.FORGE_AGENT_ID, displayName: env.FORGE_AGENT_NAME }),
      createEmailProvider({
        imap: {
          host: env.IMAP_HOST,
          port: env.IMAP_PORT,
          secure: env.IMAP_SECURE as boolean,
          user: env.IMAP_USER,
          password: env.IMAP_PASSWORD,
        },
        smtp: {
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          secure: env.SMTP_SECURE as boolean,
          user: env.SMTP_USER,
          password: env.SMTP_PASSWORD,
        },
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
