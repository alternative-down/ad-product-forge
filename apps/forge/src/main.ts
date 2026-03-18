import 'dotenv/config';

import { Mastra } from '@mastra/core';
import { ConsoleLogger } from '@mastra/core/logger';
import { createOAuthGateway, OAUTH_GATEWAY_ID } from '@mastra-engine/core';
import { z } from 'zod';

import { getDatabase, runMigrations } from './database/index.js';
import { loadAgents } from './agents/agent-loader.js';

const envSchema = z.object({
  FORGE_LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional(),
  WORKSPACE_BASE_PATH: z.string().default('./workspaces'),
});

export async function main() {
  const env = envSchema.parse(process.env);

  // Load database and agents from registry
  const db = getDatabase();
  await runMigrations(db);
  const agents = await loadAgents(db, {
    agentId: 'unused', // loadAgents loads all agents
    workspaceBasePath: env.WORKSPACE_BASE_PATH,
  });

  const mastra = new Mastra({
    agents: Object.fromEntries(agents),
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
