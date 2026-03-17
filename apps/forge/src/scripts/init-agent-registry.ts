import 'dotenv/config';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { eq, and } from 'drizzle-orm';

import * as schema from '../database/schema.js';
import { getDatabase, runMigrations } from '../database/index.js';
import { createId } from '@paralleldrive/cuid2';
import { encryptSecret } from '../encryption/crypto.js';

/**
 * Determines the gateway and provider for a given model ID
 * Supports: claude-* for Claude/Anthropic, gpt-*-codex for OpenAI Codex
 */
function resolveModelGateway(modelId: string): { provider: string; gateway: string } {
  if (modelId.includes('claude') || modelId.includes('anthropic')) {
    return { provider: 'claude-max', gateway: 'account-oauth' };
  }
  if (modelId.includes('codex')) {
    return { provider: 'openai-codex', gateway: 'account-oauth' };
  }
  throw new Error(`Unsupported model: ${modelId}. Expected 'claude-*' or '*-codex' format`);
}

/**
 * Builds the full model string for agent initialization
 * Format: {gateway}/{provider}/{modelId}
 */
function buildModelString(modelId: string): string {
  const { gateway, provider } = resolveModelGateway(modelId);
  return `${gateway}/${provider}/${modelId}`;
}

/**
 * Agent configuration - hardcoded once, then managed via database
 * Modify here to change initial agent setup, then future changes are via database
 */
const AGENTS_CONFIG = {
  forge: {
    id: 'forge-agent',
    name: 'Forge Agent',
    description: 'Main Forge agent for task execution',
    modelId: 'claude-opus-4-1',
  },
  helper: {
    id: 'forge-helper',
    name: 'Forge Helper',
    description: 'Helper agent for analysis and support',
    modelId: 'claude-opus-4-1',
  },
};

async function initAgentRegistry() {
  try {
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
        id: AGENTS_CONFIG.forge.id,
        name: AGENTS_CONFIG.forge.name,
        description: AGENTS_CONFIG.forge.description,
        model: buildModelString(AGENTS_CONFIG.forge.modelId),
        omModel: AGENTS_CONFIG.forge.modelId,
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
        id: AGENTS_CONFIG.helper.id,
        name: AGENTS_CONFIG.helper.name,
        description: AGENTS_CONFIG.helper.description,
        model: buildModelString(AGENTS_CONFIG.helper.modelId),
        omModel: AGENTS_CONFIG.helper.modelId,
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

    // Configure internal-chat provider for both agents
    const agentProviderConfigs = [
      {
        agentId: AGENTS_CONFIG.forge.id,
        providerType: 'internal-chat',
        credentials: { agentId: AGENTS_CONFIG.forge.id },
      },
      {
        agentId: AGENTS_CONFIG.helper.id,
        providerType: 'internal-chat',
        credentials: { agentId: AGENTS_CONFIG.helper.id },
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
