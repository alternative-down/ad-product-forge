/**
 * App Provisioning Ops — GitHub App lifecycle.
 *
 * Part of #1371 — split createGitHubAppManager.
 */
import type { Octokit } from 'octokit';
import { forgeDebug } from '@forge-runtime/core';
import { App } from 'octokit';
import type { OpsContext } from './ops/context';
import type { GitHubAppCredentials } from './types';

export interface AppProvisioningOps {
  getGlobalConfig: OpsContext['getGlobalConfig'];
  isConfigured: () => Promise<boolean>;
  getDefaultOwner: OpsContext['getDefaultOwner'];
  createAgentApp: (input: { agentId: string; agentName: string }) => Promise<ReturnType<OpsContext['opsRouting']['buildProvisioning']>>;
  getAgentProvisioning: (agentId: string) => Promise<ReturnType<OpsContext['opsRouting']['buildProvisioning']> | null>;
  updateAgentManifestConfig: (input: { agentId: string; manifestConfig: GitHubAppCredentials['manifestConfig'] }) => Promise<ReturnType<OpsContext['opsRouting']['buildProvisioning']>>;
  loadAllAgents: () => Promise<Array<{ agentId: string; credentials: GitHubAppCredentials }>>;
  unloadAgent: (agentId: string) => void;
  deleteAgentApp: (agentId: string) => Promise<void>;
  getCredentials: (agentId: string) => Promise<GitHubAppCredentials | null>;
  getActiveCredentials: (agentId: string) => Promise<Extract<GitHubAppCredentials, { status: 'active' }>>;
  saveCredentials: (agentId: string, credentials: GitHubAppCredentials) => Promise<void>;
  parseCredentials: (encryptedCredentials: string) => GitHubAppCredentials | null;
  createInstallationOctokit: (credentials: Extract<GitHubAppCredentials, { status: 'active' }>) => Promise<Octokit>;
  createGitHubApp: (credentials: Extract<GitHubAppCredentials, { status: 'created' | 'active' }>) => App;
}

export function createAppProvisioningOps(ctx: OpsContext): AppProvisioningOps {
  async function isConfigured() {
    return Boolean(await ctx.getGlobalConfig());
  }

  async function createAgentApp(input: { agentId: string; agentName: string }) {
    try {
      const existing = await ctx.getCredentials(input.agentId);
      if (existing) {
        forgeDebug({ scope: 'github-apps', level: 'warn', message: 'GitHub App already exists for agent', context: { agentId: input?.agentId } });
        throw new Error(`Agent ${input.agentId} already has GitHub credentials`);
      }
      const pendingCredentials: GitHubAppCredentials = {
        status: 'pending',
        state: ctx.nanoid(16),
        appName: ctx.createAppName(input.agentId, input.agentName),
        manifestConfig: ctx.normalizeManifestConfig(ctx.DEFAULT_GITHUB_APP_MANIFEST_CONFIG),
        createdAt: Date.now(),
      };
      await ctx.saveCredentials(input.agentId, pendingCredentials);
      ctx.opsRouting.registerAgentRoutes(input.agentId);
      return ctx.opsRouting.buildProvisioning(input.agentId, pendingCredentials);
    } catch (err) {
      forgeDebug({ scope: 'github-apps', level: 'error', message: '[github-apps] createAgentApp failed', context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }

  async function getAgentProvisioning(agentId: string) {
    const credentials = await ctx.getCredentials(agentId);
    if (!credentials) {
      if (await isConfigured()) {
        return ctx.opsRouting.buildProvisioning(agentId, {
          status: 'pending',
          state: ctx.nanoid(16),
          appName: '',
          manifestConfig: ctx.normalizeManifestConfig(ctx.DEFAULT_GITHUB_APP_MANIFEST_CONFIG),
          createdAt: Date.now(),
        } as GitHubAppCredentials);
      }
      return null;
    }
    return ctx.opsRouting.buildProvisioning(agentId, credentials);
  }

  async function updateAgentManifestConfig(input: {
    agentId: string;
    manifestConfig: GitHubAppCredentials['manifestConfig'];
  }) {
    try {
      const existing = await ctx.getCredentials(input.agentId);
      if (!existing) {
        forgeDebug({ scope: 'github-apps', level: 'warn', message: 'GitHub App has no credentials to update', context: { agentId: input?.agentId } });
        throw new Error(`Agent ${input.agentId} has no GitHub credentials to update`);
      }
      const updated: GitHubAppCredentials = {
        ...existing,
        manifestConfig: ctx.normalizeManifestConfig(input.manifestConfig),
      };
      await ctx.saveCredentials(input.agentId, updated);
      return ctx.opsRouting.buildProvisioning(input.agentId, updated);
    } catch (err) {
      forgeDebug({ scope: 'github-apps', level: 'error', message: '[github-apps] updateAgentManifestConfig failed', context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }

  async function loadAllAgents() {
    try {
      const rows = await ctx.config.db.query.agentProviders.findMany({
        where: ctx.and(ctx.eq(ctx.agentProviders.providerType, ctx.GITHUB_PROVIDER_TYPE)),
      });
      const result = [];
      for (const row of rows) {
        const parsed = ctx.parseCredentials(row.encryptedCredentials);
        if (parsed) result.push({ agentId: row.agentId, credentials: parsed });
      }
      return result;
    } catch (err) {
      forgeDebug({ scope: 'github-apps', level: 'error', message: '[github-apps] loadAllAgents failed', context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }

  function unloadAgent(agentId: string) {
    const cleanups = ctx.routeCleanups.get(agentId);
    if (cleanups) { cleanups.forEach((fn) => fn()); ctx.routeCleanups.delete(agentId); }
  }

  async function deleteAgentApp(agentId: string) {
    try {
      const credentials = await ctx.getCredentials(agentId);
      if (!credentials || credentials.status !== 'active') return;
      unloadAgent(agentId);
      await ctx.config.db.delete(ctx.agentProviders).where(
        ctx.and(ctx.eq(ctx.agentProviders.agentId, agentId), ctx.eq(ctx.agentProviders.providerType, ctx.GITHUB_PROVIDER_TYPE)),
      );
    } catch (err) {
      forgeDebug({ scope: 'github-apps', level: 'error', message: '[github-apps] deleteAgentApp failed', context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }

  function createGitHubApp(credentials: Extract<GitHubAppCredentials, { status: 'created' | 'active' }>): App {
    // static import used
    return new App({ appId: credentials.appId, privateKey: credentials.privateKey, webhooks: { secret: credentials.webhookSecret } });
  }

  async function createInstallationOctokit(
    credentials: Extract<GitHubAppCredentials, { status: 'active' }>,
  ): Promise<Octokit> {
    try {
      return await createGitHubApp(credentials).getInstallationOctokit(credentials.installationId);
    } catch (err) {
      forgeDebug({ scope: 'github-apps', level: 'error', message: '[github-apps] createInstallationOctokit failed', context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }

  return {
    getGlobalConfig: ctx.getGlobalConfig,
    isConfigured,
    getDefaultOwner: ctx.getDefaultOwner,
    createAgentApp,
    getAgentProvisioning,
    updateAgentManifestConfig,
    loadAllAgents,
    unloadAgent,
    deleteAgentApp,
    getCredentials: ctx.getCredentials,
    getActiveCredentials: ctx.getActiveCredentials,
    saveCredentials: ctx.saveCredentials,
    parseCredentials: ctx.parseCredentials,
    createInstallationOctokit,
    createGitHubApp,
  };
}
