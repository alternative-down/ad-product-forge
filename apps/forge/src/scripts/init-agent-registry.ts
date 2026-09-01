import 'dotenv/config';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { eq, and } from 'drizzle-orm';

import * as schema from '../database/schema';

import { getDatabase } from '../database/client';
import { runMigrations } from '../database/migrate';
import { createId } from '../utils/id';
import { encryptSecret } from '../encryption/crypto';
import { createLlmSettingsStore } from '../llm/settings-store';
import { type WorkspaceEmbedderId } from '@forge-runtime/core';
import { DEFAULT_WORKSPACE_EMBEDDER } from '../agents/agent-embedder-maintenance';
import { initAgentRegistryDebug } from './init-agent-registry-debug';

/**
 * Agent configuration - hardcoded once, then managed via database
 * Modify here to change initial agent setup, then future changes are via database
 */
const AGENTS_CONFIG = {
  forge: {
    id: 'forge-agent',
    name: 'Forge Agent',
    description: 'Main Forge agent for task execution',
  },
  helper: {
    id: 'forge-helper',
    name: 'Forge Helper',
    description: 'Helper agent for analysis and support',
  },
};

async function initAgentRegistry() {
  try {
    const systemPrompt = await readFile(
      path.resolve(import.meta.dirname, '../forge-system.md'),
      'utf8',
    );

    // Get database connection
    const db = getDatabase();

    initAgentRegistryDebug('info', 'Running database migrations');
    await runMigrations(db);
    initAgentRegistryDebug('info', 'Migrations completed');

    // Prepare agent configs
    const llmSettings = createLlmSettingsStore(db);
    const defaults = await llmSettings.getResolvedDefaults();
    const agentConfigs: Array<{
      id: string;
      name: string;
      description: string;
      modelProfileId: string;
      omModelProfileId: string;
      instructions: string;
      workspaceAutoSync: 1;
      workspaceBm25: 1;
      workspaceEmbedder: WorkspaceEmbedderId;
      workspaceFilesystem: null;
      workspaceSandbox: null;
    }> = [
      {
        id: AGENTS_CONFIG.forge.id,
        name: AGENTS_CONFIG.forge.name,
        description: AGENTS_CONFIG.forge.description,
        modelProfileId: defaults.primaryProfile.profileId,
        omModelProfileId: defaults.omProfile.profileId,
        instructions: systemPrompt,
        workspaceAutoSync: 1,
        workspaceBm25: 1,
        workspaceEmbedder: DEFAULT_WORKSPACE_EMBEDDER,
        workspaceFilesystem: null,
        workspaceSandbox: null,
      },
      {
        id: AGENTS_CONFIG.helper.id,
        name: AGENTS_CONFIG.helper.name,
        description: AGENTS_CONFIG.helper.description,
        modelProfileId: defaults.primaryProfile.profileId,
        omModelProfileId: defaults.omProfile.profileId,
        instructions: [
          systemPrompt,
          'You are the helper agent for the main Forge agent.',
          'You do not have direct external channels of your own except internal-chat.',
          'When the main agent contacts you through internal-chat, help with analysis, planning, review, and focused execution support.',
          'Reply through internal-chat when appropriate.',
        ].join('\n\n'),
        workspaceAutoSync: 1,
        workspaceBm25: 1,
        workspaceEmbedder: DEFAULT_WORKSPACE_EMBEDDER,
        workspaceFilesystem: null,
        workspaceSandbox: null,
      },
    ];

    // Register agents
    initAgentRegistryDebug('info', 'Registering agents in database');
    for (const config of agentConfigs) {
      const now = Date.now();

      // Atomic upsert: insert if not exists, otherwise update the 10 mutable
      // fields. Replaces the prior existence-check + if/else split that
      // duplicated the field mapping across two paths (#6169).
      await db
        .insert(schema.agents)
        .values({
          id: config.id,
          name: config.name,
          description: config.description,
          modelProfileId: config.modelProfileId,
          omModelProfileId: config.omModelProfileId,
          instructions: config.instructions,
          workspaceAutoSync: config.workspaceAutoSync,
          workspaceBm25: config.workspaceBm25,
          workspaceEmbedder: config.workspaceEmbedder,
          workspaceFilesystem: config.workspaceFilesystem,
          workspaceSandbox: config.workspaceSandbox,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: schema.agents.id,
          set: {
            name: config.name,
            description: config.description,
            modelProfileId: config.modelProfileId,
            omModelProfileId: config.omModelProfileId,
            instructions: config.instructions,
            workspaceAutoSync: config.workspaceAutoSync,
            workspaceBm25: config.workspaceBm25,
            workspaceEmbedder: config.workspaceEmbedder,
            workspaceFilesystem: config.workspaceFilesystem,
            workspaceSandbox: config.workspaceSandbox,
            updatedAt: now,
          },
        });

      initAgentRegistryDebug('info', 'Registered agent', { agentId: config.id });
    }

    // Register communication providers for agents
    initAgentRegistryDebug('info', 'Registering communication providers');

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
          eq(schema.agentProviders.providerType, providerConfig.providerType),
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

        initAgentRegistryDebug('info', 'Updated provider', { agentId: providerConfig.agentId, providerType: providerConfig.providerType });
      } else {
        // Insert new provider
        await db.insert(schema.agentProviders).values({
          id: createId(),
          agentId: providerConfig.agentId,
          providerType: providerConfig.providerType,
          encryptedCredentials: encryptedCreds,
          createdAt: now,
          updatedAt: now,
        });

        initAgentRegistryDebug('info', 'Created provider', { agentId: providerConfig.agentId, providerType: providerConfig.providerType });
      }
    }

    initAgentRegistryDebug('info', 'Agent registry initialized successfully');
    process.exit(0);
  } catch (error) {
    initAgentRegistryDebug('error', 'Error initializing agent registry', { error: errorMsg(error) });
    process.exit(1);
  }
}
import { errorMsg } from '../agents/error-formatting';

initAgentRegistry();
