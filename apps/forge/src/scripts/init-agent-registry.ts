import 'dotenv/config';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

import * as schema from '../database/schema.js';
import { getDatabase, runMigrations } from '../database/index.js';
import { createId } from '@paralleldrive/cuid2';
import { encryptSecret } from '../encryption/crypto.js';

const envSchema = z.object({
  FORGE_MODEL_PROVIDER: z.enum(['openai-codex', 'claude-max']),
  FORGE_MODEL_ID: z.string().min(1),
  FORGE_AGENT_ID: z.string().min(1),
  FORGE_AGENT_NAME: z.string().min(1),
  FORGE_HELPER_AGENT_ID: z.string().optional(),
  FORGE_HELPER_AGENT_NAME: z.string().optional(),
});

async function initAgentRegistry() {
  try {
    const env = envSchema.parse(process.env);
    const systemPrompt = await readFile(
      path.resolve(import.meta.dirname, '../forge-system.md'),
      'utf8'
    );

    // Get database connection
    const db = getDatabase();

    console.log('[Init] Running database migrations...');
    await runMigrations(db);
    console.log('[Init] Migrations completed ✓');

    // Prepare agent configs
    const agentConfigs = [
      {
        id: env.FORGE_AGENT_ID,
        name: env.FORGE_AGENT_NAME,
        description: 'Main Forge agent for task execution',
        model: `oauth-gateway/claude-max/${env.FORGE_MODEL_ID}`,
        omModel: env.FORGE_MODEL_ID,
        instructions: systemPrompt,
        tools: null,
        workflows: null,
        workspaceAutoSync: 1,
        workspaceBm25: 1,
        workspaceEmbedder: 'fastembed',
        workspaceFilesystem: null,
        workspaceSandbox: null,
      },
      {
        id: env.FORGE_HELPER_AGENT_ID || 'forge-helper',
        name: env.FORGE_HELPER_AGENT_NAME || 'Forge Helper',
        description: 'Helper agent for analysis and support',
        model: `oauth-gateway/claude-max/${env.FORGE_MODEL_ID}`,
        omModel: env.FORGE_MODEL_ID,
        instructions: [
          systemPrompt,
          'You are the helper agent for the main Forge agent.',
          'You do not have direct external channels of your own except internal-chat.',
          'When the main agent contacts you through internal-chat, help with analysis, planning, review, and focused execution support.',
          'Reply through internal-chat when appropriate.',
        ].join('\n\n'),
        tools: null,
        workflows: null,
        workspaceAutoSync: 1,
        workspaceBm25: 1,
        workspaceEmbedder: 'fastembed',
        workspaceFilesystem: null,
        workspaceSandbox: null,
      },
    ];

    // Register agents
    console.log('[Init] Registering agents in database...');
    for (const config of agentConfigs) {
      const now = Date.now();

      // Check if agent exists
      const existing = await db.query.agents.findFirst({
        where: eq(schema.agents.id, config.id),
      });

      if (existing) {
        // Update existing agent
        await db
          .update(schema.agents)
          .set({
            name: config.name,
            description: config.description,
            model: config.model,
            omModel: config.omModel,
            instructions: config.instructions,
            tools: config.tools,
            workflows: config.workflows,
            workspaceAutoSync: config.workspaceAutoSync,
            workspaceBm25: config.workspaceBm25,
            workspaceEmbedder: config.workspaceEmbedder,
            workspaceFilesystem: config.workspaceFilesystem,
            workspaceSandbox: config.workspaceSandbox,
            updatedAt: now,
          })
          .where(eq(schema.agents.id, config.id));

        console.log(`  ✓ Updated agent: ${config.id}`);
      } else {
        // Insert new agent
        await db.insert(schema.agents).values({
          id: config.id,
          name: config.name,
          description: config.description,
          model: config.model,
          omModel: config.omModel,
          instructions: config.instructions,
          tools: config.tools,
          workflows: config.workflows,
          workspaceAutoSync: config.workspaceAutoSync,
          workspaceBm25: config.workspaceBm25,
          workspaceEmbedder: config.workspaceEmbedder,
          workspaceFilesystem: config.workspaceFilesystem,
          workspaceSandbox: config.workspaceSandbox,
          createdAt: now,
          updatedAt: now,
        });

        console.log(`  ✓ Created agent: ${config.id}`);
      }
    }

    // Register communication providers for agents
    console.log('[Init] Registering communication providers...');
    const forgeAgentId = env.FORGE_AGENT_ID;
    const helperAgentId = env.FORGE_HELPER_AGENT_ID || 'forge-helper';

    // Configure internal-chat provider for both agents
    const agentProviderConfigs = [
      {
        agentId: forgeAgentId,
        providerType: 'internal-chat',
        credentials: { agentId: forgeAgentId },
      },
      {
        agentId: helperAgentId,
        providerType: 'internal-chat',
        credentials: { agentId: helperAgentId },
      },
    ];

    for (const providerConfig of agentProviderConfigs) {
      // Check if provider already exists for this agent
      const existing = await db.query.agentProviders.findFirst({
        where: and(
          eq(schema.agentProviders.agentId, providerConfig.agentId),
          eq(schema.agentProviders.providerType, providerConfig.providerType)
        ),
      });

      const now = Date.now();

      const encryptedCreds = encryptSecret(JSON.stringify(providerConfig.credentials));

      if (existing) {
        // Update existing provider (credentials)
        await db
          .update(schema.agentProviders)
          .set({
            encryptedCredentials: encryptedCreds,
          })
          .where(eq(schema.agentProviders.id, existing.id));

        console.log(`  ✓ Updated provider: ${providerConfig.agentId}/${providerConfig.providerType}`);
      } else {
        // Insert new provider
        await db.insert(schema.agentProviders).values({
          id: createId(),
          agentId: providerConfig.agentId,
          providerType: providerConfig.providerType,
          encryptedCredentials: encryptedCreds,
          createdAt: now,
        });

        console.log(`  ✓ Created provider: ${providerConfig.agentId}/${providerConfig.providerType}`);
      }
    }

    // Verify agents were registered
    const agents = await db.query.agents.findMany();
    console.log(`\n[Init] Agent Registry Status:`);
    console.log(`  Total agents: ${agents.length}`);
    agents.forEach((agent: typeof schema.agents.$inferSelect) => {
      console.log(`    - ${agent.id}: ${agent.name}`);
      console.log(`      Model: ${agent.model}`);
      console.log(`      Instructions: ${agent.instructions ? agent.instructions.substring(0, 50) + '...' : 'N/A'}`);
    });

    console.log('\n[Init] Agent registry initialized successfully ✓');
    process.exit(0);
  } catch (error) {
    console.error('[Init] Error initializing agent registry:', error);
    process.exit(1);
  }
}

initAgentRegistry();
