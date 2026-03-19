import 'dotenv/config';

import { Mastra } from '@mastra/core';
import { ConsoleLogger } from '@mastra/core/logger';
import { createOAuthGateway } from '@mastra-engine/core';
import { z } from 'zod';

import { getDatabase, runMigrations, seedModelPrices } from './database/index.js';
import { getInternalAgentRegistry } from './agents/internal-agent-registry.js';
import { createInternalAgentWorkflows } from './workflows/internal-agents.js';

const envSchema = z.object({
  FORGE_LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional(),
  WORKSPACE_BASE_PATH: z.string().default('./workspaces'),
});

export async function main() {
  const env = envSchema.parse(process.env);

  // Load database and agents from registry
  const db = getDatabase();
  await runMigrations(db);
  await seedModelPrices(db);
  const workflows = createInternalAgentWorkflows({
    db,
    workspaceBasePath: env.WORKSPACE_BASE_PATH,
  });
  const registry = getInternalAgentRegistry();
  const agents = await registry.loadAll(db, {
    workspaceBasePath: env.WORKSPACE_BASE_PATH,
    workflows,
  });

  new Mastra({
    agents: Object.fromEntries(agents.map(({ runtime }) => [runtime.id, runtime.agent])),
    workflows,
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
