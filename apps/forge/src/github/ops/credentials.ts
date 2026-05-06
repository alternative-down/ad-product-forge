/**
 * Credentials Ops — getCredentials, getActiveCredentials, saveCredentials,
 * parseCredentials, getInstallationOctokit, getInstallationToken,
 * createGitHubApp, createInstallationOctokit
 */
import type { Octokit } from 'octokit';
import type { OpsContext } from './context';
import type { GitHubAppCredentials } from '../types';

const SCOPE = 'github-ops-credentials';

export function createCredentialsOps(ctx: OpsContext) {
  async function getCredentials(agentId: string) {
    const db = ctx.config.db as {
      query: {
        agentProviders: {
          findFirst: (opts: { where: unknown }) => Promise<{ encryptedCredentials: string } | null>;
        };
      };
    };
    let provider;
    try {
      provider = await db.query.agentProviders.findFirst({
        where: ctx.and(
          ctx.eq((ctx.agentProviders as { agentId: unknown }).agentId, agentId),
          ctx.eq((ctx.agentProviders as { providerType: unknown }).providerType, ctx.GITHUB_PROVIDER_TYPE)
        ) as Parameters<typeof ctx.and>[0],
      });
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: `getCredentials: DB query failed: ${err}`, context: { agentId } });
      throw err;
    }
    if (!provider) return null;
    let credentials;
    try {
      credentials = ctx.parseCredentials(provider.encryptedCredentials);
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: `getCredentials: parseCredentials failed: ${err}`, context: { agentId } });
      throw err;
    }
    return credentials;
  }

  async function getActiveCredentials(agentId: string) {
    let credentials;
    try {
      credentials = await getCredentials(agentId);
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: 'getActiveCredentials: getCredentials failed', context: { agentId, error: err } });
      throw err;
    }
    if (!credentials || credentials.status !== 'active') {
      throw new Error(`GitHub App not active for agent ${agentId}`);
    }
    return credentials;
  }

  async function saveCredentials(agentId: string, credentials: GitHubAppCredentials) {
    try {
      return await ctx.saveCredentials(agentId, credentials);
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: `saveCredentials failed: ${err}`, context: { agentId } });
      throw err;
    }
  }

  function parseCredentials(encryptedCredentials: string) {
    return ctx.parseCredentials(encryptedCredentials);
  }

  async function getInstallationOctokit(agentId: string): Promise<Octokit> {
    let credentials;
    try {
      credentials = await getActiveCredentials(agentId);
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: 'getInstallationOctokit: getActiveCredentials failed', context: { agentId, error: err } });
      throw err;
    }
    try {
      return await ctx.createInstallationOctokit(credentials.installationId);
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: `getInstallationOctokit: createInstallationOctokit failed: ${err}`, context: { agentId, installationId: credentials.installationId } });
      throw err;
    }
  }

  async function createInstallationOctokit(installationId: number) {
    try {
      return await ctx.createInstallationOctokit(installationId);
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: `createInstallationOctokit failed: ${err}`, context: { installationId } });
      throw err;
    }
  }

  async function getInstallationToken(credentials: Extract<GitHubAppCredentials, { status: 'active' }>) {
    try {
      return await ctx.getInstallationToken(credentials);
    } catch (err) {
      ctx.forgeDebug({ scope: SCOPE, level: 'error', message: `getInstallationToken failed: ${err}`, context: { agentId: credentials.agentId } });
      throw err;
    }
  }

  return {
    getCredentials,
    getActiveCredentials,
    saveCredentials,
    parseCredentials,
    getInstallationOctokit,
    getInstallationToken,
    createInstallationOctokit,
  };
}