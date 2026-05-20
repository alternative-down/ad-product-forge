/**
 * Credentials Ops — getCredentials, getActiveCredentials, saveCredentials,
 * parseCredentials, getInstallationOctokit, getInstallationToken,
 * createGitHubApp, createInstallationOctokit
 */
import type { Octokit } from 'octokit';
import type { OpsContext } from './context';
import type { GitHubAppCredentials } from '../types';
import { forgeDebug } from '@forge-runtime/core';

export function createCredentialsOps(ctx: OpsContext) {
  async function getCredentials(agentId: string) {
    const db = ctx.config.db as unknown as {
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
          /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
          ctx.eq((ctx.agentProviders as any).agentId, agentId),
          ctx.eq((ctx.agentProviders as any).providerType, ctx.GITHUB_PROVIDER_TYPE) /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        ) as any, /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      });
    } catch (err) {
      forgeDebug({ scope: 'github-ops-credentials', level: 'error', message: 'getCredentials DB read failed', context: { agentId, error: err instanceof Error ? err.message : String(err) } });
      throw err;
    }
    if (!provider) return null;
    return ctx.parseCredentials(provider.encryptedCredentials);
  }

  async function getActiveCredentials(agentId: string) {
    let credentials;
    try {
      credentials = await getCredentials(agentId);
    } catch (err) {
      forgeDebug({ scope: 'github-ops-credentials', level: 'error', message: 'getActiveCredentials failed', context: { agentId, error: err instanceof Error ? err.message : String(err) } });
      throw err;
    }
    if (!credentials || credentials.status !== 'active') {
      forgeDebug({ scope: "github-ops-credentials", level: "warn", message: "getInstallationOctokit: GitHub App not active", context: { agentId } });
      throw new Error(`GitHub App not active for agent ${agentId}`);
    }
    return credentials;
  }

  async function saveCredentials(agentId: string, credentials: GitHubAppCredentials) {
    return await ctx.saveCredentials(agentId, credentials);
  }

  function parseCredentials(encryptedCredentials: string) {
    return ctx.parseCredentials(encryptedCredentials);
  }

  async function getInstallationOctokit(agentId: string) {
    let credentials;
    try {
      credentials = await getActiveCredentials(agentId);
    } catch (err) {
      forgeDebug({ scope: 'github-ops-credentials', level: 'error', message: 'getInstallationOctokit failed', context: { agentId, error: err instanceof Error ? err.message : String(err) } });
      throw err;
    }
    return await ctx.createInstallationOctokit(credentials as any); /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  }

  async function createInstallationOctokit(installationId: number) {
    return await ctx.createInstallationOctokit({ status: "active", installationId } as any); /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  }

  async function getInstallationToken(credentials: Extract<GitHubAppCredentials, { status: 'active' }>) {
    return await ctx.getInstallationToken(credentials);
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