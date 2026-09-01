/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import fs from 'node:fs/promises';
import path from 'node:path';

import { createClient } from '@libsql/client';
import { z } from 'zod';

export type ProviderId = 'openai-codex' | 'anthropic';
export type OAuthCredential = {
  access: string;
  refresh?: string;
  expires?: number;
  accountId?: string;
};

const credentialSchema = z.object({
  access: z.string(),
  refresh: z.string().optional(),
  expires: z.number().optional(),
  accountId: z.string().optional(),
});
const storeSchema = z.object({
  'openai-codex': credentialSchema.optional(),
  anthropic: credentialSchema.optional(),
});

export function createOAuthStore() {
  function getDefaultPath() {
    const dataPath = process.env.FORGE_DATA_PATH ?? './data';
    const resolvedDataPath = path.resolve(process.cwd(), dataPath);
    return path.join(resolvedDataPath, 'agents.db');
  }

  async function readJsonFile(filePath: string) {
    try {
      return JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return null;
      }

      if (error instanceof SyntaxError) {
        throw new Error(`Failed to parse JSON in ${filePath}: ${error.message}`);
      }

      throw error;
    }
  }

  async function read(storePath = getDefaultPath()) {
    await fs.mkdir(path.dirname(storePath), { recursive: true });
    const client = createClient({ url: `file:${storePath}` });

    try {
      await ensureSchema(client);

      const result = await client.execute(`
        select provider_id, credential_json
        from oauth_credentials
      `);
      const storeEntries: Array<[string, unknown]> = [];

      for (const row of result.rows) {
        if (typeof row.provider_id !== 'string' || typeof row.credential_json !== 'string') {
          continue;
        }

        storeEntries.push([row.provider_id, JSON.parse(row.credential_json)]);
      }

      const store = Object.fromEntries(storeEntries);

      return storeSchema.parse(store);
    } finally {
      client.close();
    }
  }

  async function write(
    provider: ProviderId,
    credential: OAuthCredential,
    storePath = getDefaultPath(),
  ) {
    await fs.mkdir(path.dirname(storePath), { recursive: true });
    const client = createClient({ url: `file:${storePath}` });

    try {
      await ensureSchema(client);
      await client.execute({
        sql: `
          insert into oauth_credentials (provider_id, credential_json, updated_at)
          values (?, ?, unixepoch() * 1000)
          on conflict(provider_id) do update set
            credential_json = excluded.credential_json,
            updated_at = excluded.updated_at
        `,
        args: [provider, JSON.stringify(credential)],
      });
    } finally {
      client.close();
    }
  }

  async function readCredentialFile(filePath: string) {
    const raw = (await fs.readFile(filePath, 'utf8')).trim();

    if (!raw.startsWith('{')) {
      return { access: raw } satisfies OAuthCredential;
    }

    return credentialSchema.parse(JSON.parse(raw));
  }

  function isExpired(credential: OAuthCredential, skewMs = 60_000) {
    if (!credential.expires) {
      return false;
    }

    return Date.now() + skewMs >= credential.expires;
  }

  return {
    getDefaultPath,
    readJsonFile,
    read,
    write,
    readCredentialFile,
    isExpired,
  };
}

async function ensureSchema(client: ReturnType<typeof createClient>) {
  await client.execute(`
    create table if not exists oauth_credentials (
      provider_id text primary key,
      credential_json text not null,
      updated_at integer not null
    )
  `);
}

export const oauthStore = createOAuthStore();
