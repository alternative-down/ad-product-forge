/**
 * Credentials Ops — encrypted storage and retrieval of GitHub App credentials.
 *
 * Part of #5318 — split createGitHubAppManager.
 *
 * Provides:
 * - getCredentials: read encrypted credentials for an agent
 * - getActiveCredentials: read active credentials (throws if not active)
 * - saveCredentials: upsert encrypted credentials for an agent
 * - parseCredentials: decrypt and validate stored credentials
 */
import { and, eq } from 'drizzle-orm';
import { forgeDebug } from '@forge-runtime/core';
import { encryptSecret, decryptSecret } from '../../encryption/crypto';
import { createId } from '../../utils/id';
import { NewAgentProvider, agentProviders } from '../../database/schema';
import { errorMsg } from '../../agents/agent-runner-error-formatting';
import { githubAppCredentialsSchema } from '../types';
import { normalizeGitHubAppCredentials } from '../helpers';
import type { OpsContext } from './context';
import type { GitHubAppCredentials } from '../types';

export interface CredentialsOps {
  getCredentials: (agentId: string) => Promise<GitHubAppCredentials | null>;
  getActiveCredentials: (
    agentId: string,
  ) => Promise<Extract<GitHubAppCredentials, { status: 'active' }>>;
  saveCredentials: (agentId: string, credentials: GitHubAppCredentials) => Promise<void>;
  parseCredentials: (encryptedCredentials: string) => GitHubAppCredentials | null;
}

export function createCredentialsOps(ctx: OpsContext): CredentialsOps {
  async function getCredentials(agentId: string) {
    const provider = await ctx.config.db.query.agentProviders.findFirst({
      where: and(
        eq(agentProviders.agentId, agentId),
        eq(agentProviders.providerType, ctx.GITHUB_PROVIDER_TYPE),
      ),
    });

    if (provider === null || provider === undefined) {
      return null;
    }

    return parseCredentials(provider.encryptedCredentials);
  }

  async function getActiveCredentials(agentId: string) {
    const credentials = await getCredentials(agentId);

    if (!credentials || credentials.status !== 'active') {
      forgeDebug({
        scope: 'github-manager',
        level: 'warn',
        message: 'GitHub App not active for agent',
        context: { agentId },
      });
      throw new Error(`GitHub App not active for agent ${agentId}`);
    }

    return credentials;
  }

  async function saveCredentials(agentId: string, credentials: GitHubAppCredentials) {
    const existing = await ctx.config.db.query.agentProviders.findFirst({
      where: and(
        eq(agentProviders.agentId, agentId),
        eq(agentProviders.providerType, ctx.GITHUB_PROVIDER_TYPE),
      ),
    });
    const encryptedCredentials = encryptSecret(JSON.stringify(credentials));

    if (existing !== null && existing !== undefined) {
      await ctx.config.db
        .update(agentProviders)
        .set({ encryptedCredentials })
        .where(eq(agentProviders.id, existing.id));
      return;
    }

    const providerRecord: NewAgentProvider = {
      id: createId(),
      agentId,
      providerType: ctx.GITHUB_PROVIDER_TYPE,
      encryptedCredentials,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await ctx.config.db.insert(agentProviders).values(providerRecord);
  }

  function parseCredentials(encryptedCredentials: string) {
    try {
      const raw = JSON.parse(decryptSecret(encryptedCredentials)) as Record<string, unknown>;
      return githubAppCredentialsSchema.parse(normalizeGitHubAppCredentials(raw as never));
    } catch (error) {
      forgeDebug({
        scope: 'github-manager',
        level: 'error',
        message: 'Failed to parse GitHub credentials: ' + errorMsg(error),
      });
      return null;
    }
  }

  return {
    getCredentials,
    getActiveCredentials,
    saveCredentials,
    parseCredentials,
  };
}
