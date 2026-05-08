/**
 * Shared OAuth state builder — used by both read and write system routes.
 * Exported so it can also be imported by tests.
 */

import { oauthStore, type OAuthCredential, type ProviderId } from '@forge-runtime/core';
import { fsPathExists } from '../helpers';
import { forgeDebug } from '@forge-runtime/core';

export type SystemOauthProvider = {
  providerId: ProviderId;
  sourcePath: string;
  sourcePresent: boolean;
  synced: boolean;
  hasRefresh: boolean;
  expiresAt: number | null;
  accountId: string | null;
};

export type SystemOauthState = {
  storePath: string;
  providers: SystemOauthProvider[];
};

/**
 * Reads the OAuth store and returns the shape expected by the Admin UI.
 * Credential fields are mapped directly from OAuthCredential (which uses
 * ms timestamps, matching the number | null declared in the client type).
 */
export async function buildOauthState(): Promise<SystemOauthState> {
  try {
    const store = oauthStore;
    const storePath = store.getDefaultPath();
    const raw = await store.read();

    const providers: SystemOauthProvider[] = [];

    for (const [providerId, credential] of Object.entries(raw) as [
      ProviderId,
      OAuthCredential | undefined,
    ][]) {
      providers.push({
        providerId,
        sourcePath: storePath,
        sourcePresent: await fsPathExists(storePath),
        synced: Boolean(credential?.accountId),
        hasRefresh: Boolean(credential?.refresh),
        expiresAt: credential?.expires ?? null,
        accountId: credential?.accountId ?? null,
      });
    }

    return { storePath, providers };
  } catch (err) {
    forgeDebug({ scope: 'oauth-state', level: 'error', message: '[oauth-state] buildOauthState failed', context: { error: err instanceof Error ? err.message : String(err) }});
    throw err;
  }
}