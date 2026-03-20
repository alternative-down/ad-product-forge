import crypto from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import type { Database } from '../database/index.js';
import { agentProviders } from '../database/schema.js';
import { decryptSecret } from '../encryption/crypto.js';
import { createSystemProviderStore } from '../providers/system-provider-store.js';
import type { ProviderCredentialsMap } from '../communication/provider-loader.js';

const EMAIL_PROVIDER_TYPE = 'email';

const migaduMailboxSchema = z.object({
  address: z.string().email(),
  local_part: z.string().min(1),
  name: z.string().nullable().optional(),
});

const emailProviderCredentialsSchema = z.object({
  imap: z.object({
    host: z.string(),
    port: z.number().int().positive(),
    secure: z.boolean(),
    user: z.string().email(),
    password: z.string().min(1),
  }),
  smtp: z.object({
    host: z.string(),
    port: z.number().int().positive(),
    secure: z.boolean(),
    user: z.string().email(),
    password: z.string().min(1),
  }),
  bcc: z.string().email().optional(),
});

type EmailProviderCredentials = z.infer<typeof emailProviderCredentialsSchema>;

export type AgentEmailManager = ReturnType<typeof createAgentEmailManager>;

export function createAgentEmailManager(config: {
  db: Database;
}) {
  const systemProviders = createSystemProviderStore(config.db);
  async function provisionMailbox(input: { agentId: string; agentName: string }) {
    const localPart = buildMailboxLocalPart(input.agentId);
    const password = createMailboxPassword();
    const existingMailbox = await getMailbox(localPart);

    if (existingMailbox) {
      await updateMailbox(localPart, {
        name: input.agentName,
        password,
      });
    } else {
      await createMailbox({
        localPart,
        name: input.agentName,
        password,
      });
    }

    const providerConfig = await getProviderConfig();
    const address = `${localPart}@${providerConfig.domain}`;

    return {
      address,
      credentials: buildProviderCredentials(providerConfig, address, password),
    };
  }

  async function deleteAgentMailbox(agentId: string) {
    const credentials = await getStoredCredentials(agentId);

    if (!credentials) {
      return;
    }

    await deleteMailboxByAddress(credentials.imap.user);
  }

  async function deleteMailboxByAddress(address: string) {
    const localPart = getLocalPart(address);
    const providerConfig = await getProviderConfig();
    const response = await fetch(buildUrl(providerConfig, `/domains/${providerConfig.domain}/mailboxes/${localPart}`), {
      method: 'DELETE',
      headers: buildHeaders(providerConfig),
    });

    if (response.ok || response.status === 404) {
      return;
    }

    throw await buildMigaduError('delete mailbox', response);
  }

  async function getStoredCredentials(agentId: string) {
    const provider = await config.db.query.agentProviders.findFirst({
      where: and(eq(agentProviders.agentId, agentId), eq(agentProviders.providerType, EMAIL_PROVIDER_TYPE)),
    });

    if (!provider) {
      return null;
    }

    return parseStoredCredentials(provider.encryptedCredentials);
  }

  async function getMailbox(localPart: string) {
    const providerConfig = await getProviderConfig();
    const response = await fetch(buildUrl(providerConfig, `/domains/${providerConfig.domain}/mailboxes/${localPart}`), {
      headers: buildHeaders(providerConfig),
    });

    if (response.ok) {
      return migaduMailboxSchema.parse(await response.json());
    }

    if (response.status === 400 || response.status === 404) {
      return null;
    }

    throw await buildMigaduError('load mailbox', response);
  }

  async function createMailbox(input: { localPart: string; name: string; password: string }) {
    const providerConfig = await getProviderConfig();
    const response = await fetch(buildUrl(providerConfig, `/domains/${providerConfig.domain}/mailboxes`), {
      method: 'POST',
      headers: buildHeaders(providerConfig),
      body: JSON.stringify({
        local_part: input.localPart,
        name: input.name,
        password: input.password,
      }),
    });

    if (!response.ok) {
      throw await buildMigaduError('create mailbox', response);
    }

    return migaduMailboxSchema.parse(await response.json());
  }

  async function updateMailbox(localPart: string, input: { name: string; password: string }) {
    const providerConfig = await getProviderConfig();
    const response = await fetch(buildUrl(providerConfig, `/domains/${providerConfig.domain}/mailboxes/${localPart}`), {
      method: 'PUT',
      headers: buildHeaders(providerConfig),
      body: JSON.stringify({
        name: input.name,
        password: input.password,
      }),
    });

    if (!response.ok) {
      throw await buildMigaduError('update mailbox', response);
    }

    return migaduMailboxSchema.parse(await response.json());
  }

  async function getProviderConfig() {
    const providerConfig = await systemProviders.getMigadu();

    if (!providerConfig) {
      throw new Error('Migadu provider is not configured in system_providers');
    }

    return providerConfig;
  }

  function buildProviderCredentials(providerConfig: { imapHost: string; imapPort: number; imapSecure: boolean; smtpHost: string; smtpPort: number; smtpSecure: boolean; bcc?: string }, address: string, password: string): ProviderCredentialsMap['email'] {
    return {
      imap: {
        host: providerConfig.imapHost,
        port: providerConfig.imapPort,
        secure: providerConfig.imapSecure,
        user: address,
        password,
      },
      smtp: {
        host: providerConfig.smtpHost,
        port: providerConfig.smtpPort,
        secure: providerConfig.smtpSecure,
        user: address,
        password,
      },
      bcc: providerConfig.bcc,
    };
  }

  function buildUrl(providerConfig: { apiBaseUrl: string }, path: string) {
    return new URL(path.replace(/^\//, ''), ensureTrailingSlash(providerConfig.apiBaseUrl)).toString();
  }

  function buildHeaders(providerConfig: { apiUser: string; apiKey: string }) {
    return {
      Authorization: `Basic ${Buffer.from(`${providerConfig.apiUser}:${providerConfig.apiKey}`).toString('base64')}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  return {
    provisionMailbox,
    deleteAgentMailbox,
    deleteMailboxByAddress,
  };
}

function ensureTrailingSlash(value: string) {
  return value.endsWith('/') ? value : `${value}/`;
}

function buildMailboxLocalPart(agentId: string) {
  const normalized = agentId
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!normalized) {
    throw new Error(`Cannot derive mailbox local part from agent id: ${agentId}`);
  }

  return normalized;
}

function createMailboxPassword() {
  return crypto.randomBytes(24).toString('base64url');
}

function getLocalPart(address: string) {
  const [localPart] = address.split('@');

  if (!localPart) {
    throw new Error(`Invalid mailbox address: ${address}`);
  }

  return localPart;
}

async function buildMigaduError(action: string, response: Response) {
  const bodyText = await response.text();
  const message = bodyText || response.statusText || 'unknown error';
  return new Error(`Migadu ${action} failed (${response.status}): ${message}`);
}

function parseStoredCredentials(encryptedCredentials: string) {
  const decrypted = decryptSecret(encryptedCredentials);
  return emailProviderCredentialsSchema.parse(JSON.parse(decrypted));
}
