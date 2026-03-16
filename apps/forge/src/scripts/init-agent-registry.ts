import 'dotenv/config';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import * as schema from '../database/schema.js';
import { getDatabase, runMigrations } from '../database/index.js';

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
