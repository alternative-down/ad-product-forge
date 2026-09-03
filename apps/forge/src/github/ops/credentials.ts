import { GitHubAppNotActiveError } from './credentials.errors';
/**
 * Credentials Ops — encrypted storage and retrieval of GitHub App credentials.
 *
 * Part of #5318 — split createGitHubAppManager.
 *
 * Provides:
 * - getCredentials: read encrypted credentials for an agent
 * - getActiveCredentials: read active credentials (throws if not active)
 * - saveCredentials: upsert encrypted credentials for an agent
 * - deleteCredentials: remove credentials row (used by deleteAgentApp)
 * - insertCredentialsIfAbsent: atomic INSERT OR IGNORE for race-free
 *   createAgentApp (see #6799)
 * - parseCredentials: decrypt and validate stored credentials
 */
import { and, eq, sql } from 'drizzle-orm';
import { encryptSecret, decryptSecret } from '../../encryption/crypto';
import { createId } from '../../utils/id';
import { NewAgentProvider, agentProviders } from '../../database/schema';
import { errorMsg } from '../../agents/error-formatting';
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
  deleteCredentials: (agentId: string) => Promise<void>;
  insertCredentialsIfAbsent: (agentId: string, credentials: GitHubAppCredentials) => Promise<boolean>;
  parseCredentials: (encryptedCredentials: string) => GitHubAppCredentials | null;
}

export function createCredentialsOps(ctx: OpsContext): CredentialsOps {
  const credentialsOpsDebug = (
    level: 'info' | 'warn' | 'error',
    message: string,
    context?: Record<string, unknown>,
  ): void => {
    ctx.forgeDebug({ scope: 'github-manager', level, message, context });
  };

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
      credentialsOpsDebug('warn', 'GitHub App not active for agent', { agentId });
      throw new GitHubAppNotActiveError(agentId);
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

  async function insertCredentialsIfAbsent(
    agentId: string,
    credentials: GitHubAppCredentials,
  ): Promise<boolean> {
    const encryptedCredentials = encryptSecret(JSON.stringify(credentials));

    const providerRecord: NewAgentProvider = {
      id: createId(),
      agentId,
      providerType: ctx.GITHUB_PROVIDER_TYPE,
      encryptedCredentials,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Atomic conflict handling via raw INSERT OR IGNORE.
    //
    // Why raw SQL instead of Drizzle's .onConflictDoNothing()?
    //
    // 1. SQLite + uniqueIndex quirk: Drizzle generates
    //    `ON CONFLICT ("agent_providers"."agent_id", "agent_providers"."provider_type")`
    //    (table-qualified). SQLite rejects this with
    //    "ON CONFLICT clause does not match any PRIMARY KEY or UNIQUE constraint"
    //    because the constraint is referenced by the index name `agent_provider_unique`,
    //    not by the column list. Drizzle does not currently support a
    //    `target: <index name>` option for SQLite uniqueIndex columns.
    //
    // 2. libsql 0.26.5 + drizzle-orm 0.26.5 quirk: when `.onConflictDoNothing()` is
    //    used without `.returning()`, the returned object is the unevaluated
    //    SQLiteInsert builder, not the run result. There is no .changes /
    //    .rowsAffected property to inspect. This makes it impossible to
    //    detect whether the insert actually happened.
    //
    // INSERT OR IGNORE sidesteps both issues. It is atomic at the DB level,
    // honors the uniqueIndex on (agentId, providerType), and returns a
    // run result with rowsAffected: 1 on success, 0 on conflict.
    const result = await ctx.config.db.run(
      sql`INSERT OR IGNORE INTO agent_providers
          (id, agent_id, provider_type, encrypted_credentials, created_at, updated_at)
          VALUES (${providerRecord.id}, ${providerRecord.agentId}, ${providerRecord.providerType}, ${providerRecord.encryptedCredentials}, ${providerRecord.createdAt}, ${providerRecord.updatedAt})`,
    );

    // libsql/libSQL returns a run result with rowsAffected. SQLite under
    // better-sqlite3 returns { changes }. Both indicate 1 when the row
    // was inserted and 0 when the unique constraint was violated.
    const rowsAffected = result.rowsAffected;

    if (rowsAffected === 0) {
      credentialsOpsDebug('warn', 'insertCredentialsIfAbsent: row already exists', { agentId });
      return false;
    }

    credentialsOpsDebug('info', 'insertCredentialsIfAbsent: row inserted', { agentId });
    return true;
  }

  async function deleteCredentials(agentId: string) {
    const existing = await ctx.config.db.query.agentProviders.findFirst({
      where: and(
        eq(agentProviders.agentId, agentId),
        eq(agentProviders.providerType, ctx.GITHUB_PROVIDER_TYPE),
      ),
    });

    if (existing === null || existing === undefined) {
      credentialsOpsDebug('warn', 'deleteCredentials: no credentials found', { agentId });
      return;
    }

    await ctx.config.db
      .delete(agentProviders)
      .where(eq(agentProviders.id, existing.id));

    credentialsOpsDebug('info', 'deleteCredentials: removed credentials for agent', { agentId });
  }

  function parseCredentials(encryptedCredentials: string) {
    try {
      const raw: unknown = JSON.parse(decryptSecret(encryptedCredentials));
      return githubAppCredentialsSchema.parse(normalizeGitHubAppCredentials(raw));
    } catch (error) {
      credentialsOpsDebug('error', 'Failed to parse GitHub credentials: ' + errorMsg(error));
      return null;
    }
  }

  return {
    getCredentials,
    getActiveCredentials,
    saveCredentials,
    deleteCredentials,
    insertCredentialsIfAbsent,
    parseCredentials,
  };
}
