/**
 * Credentials Ops — getCredentials, getActiveCredentials, saveCredentials,
 * parseCredentials, getInstallationOctokit, getInstallationToken,
 * createGitHubApp, createInstallationOctokit
 */
import type { Octokit } from 'octokit';
import type { OpsContext } from './context.js';
import type { GitHubAppCredentials } from '../types.js';

export function createCredentialsOps(ctx: OpsContext) {
  async function getCredentials(agentId: string) {
    const db = ctx.config.db as {
      query: {
        agentProviders: {
          findFirst: (opts: { where: unknown }) => Promise<{ encryptedCredentials: string } | null>;
        };
      };
    };
    const provider = await db.query.agentProviders.findFirst({
      where: ctx.and(
        ctx.eq((ctx.agentProviders as { agentId: unknown }).agentId, agentId),
        ctx.eq((ctx.agentProviders as { providerType: unknown }).providerType, ctx.GITHUB_PROVIDER_TYPE)
      ) as Parameters<typeof ctx.and>[0],
    });
    if (!provider) return null;
    return ctx.parseCredentials(provider.encryptedCredentials);
  }

  async function getActiveCredentials(agentId: string) {
    const credentials = await getCredentials(agentId);
    if (!credentials || credentials.status !== 'active') {
      throw new Error(`GitHub App not active for agent ${agentId}`);
    }
    return credentials;
  }

  async function saveCredentials(agentId: string, credentials: GitHubAppCredentials) {
    return ctx.saveCredentials(agentId, credentials);
  }

  function parseCredentials(encryptedCredentials: string) {
    return ctx.parseCredentials(encryptedCredentials);
  }

  async function getInstallationOctokit(agentId: string) {
    const credentials = await getActiveCredentials(agentId);
    return ctx.createInstallationOctokit(credentials.installationId);
  }

  async function createInstallationOctokit(installationId: number) {
    return ctx.createInstallationOctokit(installationId);
  }

  async function getInstallationToken(credentials: Extract<GitHubAppCredentials, { status: 'active' }>) {
    return ctx.getInstallationToken(credentials);
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