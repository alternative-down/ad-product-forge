/**
 * App Lifecycle Ops — Agent GitHub App provisioning and git credentials.
 *
 * Part of #5318 — split createGitHubAppManager.
 *
 * Provides:
 * - getGlobalConfig: read the GitHub integration config
 * - isConfigured: check if GitHub is configured
 * - getDefaultOwner: resolve owner (default to config org)
 * - createAgentApp: provision a new GitHub App for an agent
 * - getAgentProvisioning: get or create provisioning
 * - updateAgentManifestConfig: update app manifest config
 * - loadAllAgents: list all agents with credentials
 * - unloadAgent: clear agent's route cleanup hooks
 * - deleteAgentApp: delete GitHub App for agent
 * - getGitCredentials: return git credentials for cloning
 */
import { eq } from 'drizzle-orm';
import { forgeDebug } from '@forge-runtime/core';
import { agentProviders, agents } from '../../database/schema';
import { createAppName } from '../helpers';
import { githubAppManifestConfigSchema } from '../types';
import type { OpsContext } from './context';
import type { GitHubAppCredentials, GitHubAppManifestConfig, GitHubAppProvisioning } from '../types';
import type { GitHubAppOps } from './github-app';

export interface AppLifecycleOpsDeps {
  githubApp: GitHubAppOps;
  credentials: {
    getCredentials: (agentId: string) => Promise<GitHubAppCredentials | null>;
    getActiveCredentials: (
      agentId: string,
    ) => Promise<Extract<GitHubAppCredentials, { status: 'active' }>>;
  };
}

export interface AppLifecycleOps {
  getGlobalConfig: () => Promise<{ organization: string; appHomeUrl: string }>;
  isConfigured: () => Promise<boolean>;
  getDefaultOwner: (owner?: string) => Promise<string>;
  createAgentApp: (input: { agentId: string; agentName: string }) => Promise<GitHubAppProvisioning>;
  getAgentProvisioning: (agentId: string) => Promise<GitHubAppProvisioning | null>;
  updateAgentManifestConfig: (input: {
    agentId: string;
    manifestConfig: GitHubAppManifestConfig;
  }) => Promise<GitHubAppProvisioning>;
  loadAllAgents: () => Promise<void>;
  unloadAgent: (agentId: string) => void;
  deleteAgentApp: (agentId: string) => Promise<void>;
  getGitCredentials: (input: { agentId: string; repositoryName?: string }) => Promise<{
    username: string;
    token: string;
    expiresAt: string;
    repositoryUrl: string | undefined;
    gitUserName: string;
    gitUserEmail: string;
  }>;
}

export function createAppLifecycleOps(
  ctx: OpsContext,
  deps: AppLifecycleOpsDeps,
): AppLifecycleOps {
  const { githubApp, credentials } = deps;

  async function getGlobalConfig() {
    const githubConfig = await ctx.config.integrations.getGitHubConfig();

    if (!githubConfig) {
      forgeDebug({
        scope: 'github-manager',
        level: 'warn',
        message: 'GitHub integration not configured',
      });
      throw new Error('GitHub integration is not configured');
    }

    return githubConfig;
  }

  async function isConfigured() {
    return Boolean(await ctx.config.integrations.getGitHubConfig());
  }

  async function getDefaultOwner(owner?: string) {
    if (owner !== null && owner !== undefined) {
      return owner;
    }

    const githubConfig = await getGlobalConfig();
    return githubConfig.organization;
  }

  async function createAgentApp(input: { agentId: string; agentName: string }) {
    await getGlobalConfig();
    const existing = await credentials.getCredentials(input.agentId);

    if (existing !== null && existing !== undefined) {
      forgeDebug({
        scope: 'github-manager',
        level: 'warn',
        message: 'GitHub App already exists for agent',
        context: { agentId: input?.agentId },
      });
      throw new Error(`GitHub App already exists for agent ${input.agentId}`);
    }

    const pendingCredentials = {
      status: 'pending' as const,
      state: ctx.createId(),
      appName: createAppName(input.agentName, input.agentId),
      manifestConfig: ctx.DEFAULT_GITHUB_APP_MANIFEST_CONFIG,
      createdAt: Date.now(),
    };

    await ctx.saveCredentials(input.agentId, pendingCredentials);
    ctx.opsRouting.registerAgentRoutes(input.agentId);
    return ctx.opsRouting.buildProvisioning(input.agentId, pendingCredentials);
  }

  async function getAgentProvisioning(agentId: string) {
    const existingCredentials = await credentials.getCredentials(agentId);

    if (existingCredentials) {
      return ctx.opsRouting.buildProvisioning(agentId, existingCredentials);
    }

    if (!(await isConfigured())) {
      return null;
    }

    const agent = await ctx.config.db.query.agents.findFirst({
      where: eq(agents.id, agentId),
    });

    if (agent === null || agent === undefined) {
      return null;
    }

    return await createAgentApp({
      agentId,
      agentName: agent.name,
    });
  }

  async function updateAgentManifestConfig(input: {
    agentId: string;
    manifestConfig: GitHubAppManifestConfig;
  }) {
    const existingCredentials = await credentials.getCredentials(input.agentId);
    const manifestConfig = githubAppManifestConfigSchema.parse(input.manifestConfig);

    if (!existingCredentials) {
      forgeDebug({
        scope: 'github-manager',
        level: 'warn',
        message: 'GitHub App does not exist for agent',
        context: { agentId: input?.agentId },
      });
      throw new Error(`GitHub App does not exist for agent ${input.agentId}`);
    }

    const nextCredentials = {
      ...existingCredentials,
      manifestConfig,
    } satisfies GitHubAppCredentials;

    await ctx.saveCredentials(input.agentId, nextCredentials);
    return ctx.opsRouting.buildProvisioning(input.agentId, nextCredentials);
  }

  async function loadAllAgents() {
    const providerRows = await ctx.config.db.query.agentProviders.findMany({
      where: eq(agentProviders.providerType, ctx.GITHUB_PROVIDER_TYPE),
    });

    for (const providerRow of providerRows) {
      const credentials = ctx.parseCredentials(providerRow.encryptedCredentials);

      if (!credentials) {
        forgeDebug({
          scope: 'github-manager',
          level: 'warn',
          message: 'loadAllAgents: skipped agent due to unparseable credentials',
          context: { agentId: providerRow.agentId },
        });
        continue;
      }

      ctx.opsRouting.registerAgentRoutes(providerRow.agentId);
    }
  }

  function unloadAgent(agentId: string) {
    const cleanups = ctx.routeCleanups.get(agentId);

    if (cleanups) {
      for (const cleanup of cleanups) {
        cleanup();
      }

      ctx.routeCleanups.delete(agentId);
    }
  }

  async function deleteAgentApp(agentId: string) {
    const existingCredentials = await credentials.getCredentials(agentId);

    unloadAgent(agentId);

    if (!existingCredentials || existingCredentials.status !== 'active') {
      return;
    }

    const app = githubApp.createGitHubApp(existingCredentials);
    await app.octokit.request('DELETE /app/installations/{installation_id}', {
      installation_id: existingCredentials.installationId,
    });
  }

  async function getGitCredentials(input: { agentId: string; repositoryName?: string }) {
    const githubConfig = await getGlobalConfig();
    const activeCredentials = await credentials.getActiveCredentials(input.agentId);
    const token = await githubApp.getInstallationToken(activeCredentials);

    return {
      username: 'x-access-token',
      token: token.token,
      expiresAt: token.expiresAt,
      repositoryUrl:
        input.repositoryName !== null && input.repositoryName !== undefined
          ? `https://github.com/${githubConfig.organization}/${input.repositoryName}.git`
          : undefined,
      gitUserName: activeCredentials.appName,
      gitUserEmail: `${activeCredentials.appSlug}@forge.github-app.local`,
    };
  }

  return {
    getGlobalConfig,
    isConfigured,
    getDefaultOwner,
    createAgentApp,
    getAgentProvisioning,
    updateAgentManifestConfig,
    loadAllAgents,
    unloadAgent,
    deleteAgentApp,
    getGitCredentials,
  };
}
