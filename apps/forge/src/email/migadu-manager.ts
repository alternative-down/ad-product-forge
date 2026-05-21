import crypto from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import type { Database } from '../database/schema';
import { agentProviders } from '../database/schema';
import { decryptSecret } from '../encryption/crypto';
import type { ProviderCredentialsMap } from '../communication/provider-loader';
import type { createSystemIntegrationStore } from '../system-integrations/store';
import { forgeDebug } from '@forge-runtime/core';
import { serializeError } from '../agents/agent-runner-error-formatting';

const EMAIL_PROVIDER_TYPE = 'email';
const MIGADU_API_BASE_URL = 'https://api.migadu.com/v1';
const MIGADU_IMAP_HOST = 'imap.migadu.com';
const MIGADU_IMAP_PORT = 993;
const MIGADU_IMAP_SECURE = true;
const MIGADU_SMTP_HOST = 'smtp.migadu.com';
const MIGADU_SMTP_PORT = 465;
const MIGADU_SMTP_SECURE = true;

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

export type AgentEmailManager = ReturnType<typeof createAgentEmailManager>;

export function createAgentEmailManager(config: {
  db: Database;
  integrations: ReturnType<typeof createSystemIntegrationStore>;
}) {
  async function isConfigured() {
    try {
      return Boolean(await getOptionalProviderConfig());
    } catch (err) {
      forgeDebug({
        scope: 'migadu-manager',
        level: 'error',
        message: '[migadu-manager] isConfigured failed: ' + String(serializeError(err)),
      });
      return false;
    }
  }

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

    const providerConfig = await getRequiredProviderConfig();
    const address = `${localPart}@${providerConfig.domain}`;

    return {
      address,
      credentials: buildProviderCredentials(address, password),
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
    const providerConfig = await getOptionalProviderConfig();

    if (!providerConfig) {
      return;
    }

    const response = await fetch(
      buildUrl(providerConfig, `/domains/${providerConfig.domain}/mailboxes/${localPart}`),
      {
        method: 'DELETE',
        headers: buildHeaders(providerConfig),
      },
    );

    if (response.ok || response.status === 404) {
      return;
    }

    forgeDebug({
      scope: 'migadu-manager',
      level: 'error',
      message: '[migadu-manager] delete mailbox failed',
      context: { status: response.status },
    });
    throw await buildMigaduError('delete mailbox', response);
  }

  async function getStoredCredentials(agentId: string) {
    const provider = await config.db.query.agentProviders.findFirst({
      where: and(
        eq(agentProviders.agentId, agentId),
        eq(agentProviders.providerType, EMAIL_PROVIDER_TYPE),
      ),
    });

    if (provider === null || provider === undefined) {
      return null;
    }

    return parseStoredCredentials(provider.encryptedCredentials);
  }

  async function getMailbox(localPart: string) {
    const providerConfig = await getRequiredProviderConfig();
    const response = await fetch(
      buildUrl(providerConfig, `/domains/${providerConfig.domain}/mailboxes/${localPart}`),
      {
        headers: buildHeaders(providerConfig),
      },
    );

    if (response.ok) {
      return migaduMailboxSchema.parse(await response.json());
    }

    if (response.status === 400 || response.status === 404) {
      return null;
    }

    forgeDebug({
      scope: 'migadu-manager',
      level: 'error',
      message: '[migadu-manager] load mailbox failed',
      context: { status: response.status },
    });
    throw await buildMigaduError('load mailbox', response);
  }

  async function createMailbox(input: { localPart: string; name: string; password: string }) {
    const providerConfig = await getRequiredProviderConfig();
    const response = await fetch(
      buildUrl(providerConfig, `/domains/${providerConfig.domain}/mailboxes`),
      {
        method: 'POST',
        headers: buildHeaders(providerConfig),
        body: JSON.stringify({
          local_part: input.localPart,
          name: input.name,
          password: input.password,
        }),
      },
    );

    if (!response.ok) {
      forgeDebug({
        scope: 'migadu-manager',
        level: 'error',
        message: '[migadu-manager] create mailbox failed',
        context: { status: response.status },
      });
      throw await buildMigaduError('create mailbox', response);
    }

    return migaduMailboxSchema.parse(await response.json());
  }

  async function updateMailbox(localPart: string, input: { name: string; password: string }) {
    const providerConfig = await getRequiredProviderConfig();
    const response = await fetch(
      buildUrl(providerConfig, `/domains/${providerConfig.domain}/mailboxes/${localPart}`),
      {
        method: 'PUT',
        headers: buildHeaders(providerConfig),
        body: JSON.stringify({
          name: input.name,
          password: input.password,
        }),
      },
    );

    if (!response.ok) {
      forgeDebug({
        scope: 'migadu-manager',
        level: 'error',
        message: '[migadu-manager] update mailbox failed',
        context: { status: response.status },
      });
      throw await buildMigaduError('update mailbox', response);
    }

    return migaduMailboxSchema.parse(await response.json());
  }

  async function getOptionalProviderConfig() {
    const integration = await config.integrations.getMigaduConfig();

    if (!integration) {
      return null;
    }

    const domain = integration.apiUser.split('@')[1];

    if (!domain) {
      forgeDebug({
        scope: 'migadu-manager',
        level: 'warn',
        message: '[migadu-manager] buildMigaduConfig: cannot derive Migadu domain from API user',
        context: { apiUser: integration.apiUser },
      });
      throw new Error(`Cannot derive Migadu domain from API user: ${integration.apiUser}`);
    }

    return {
      apiBaseUrl: MIGADU_API_BASE_URL,
      apiUser: integration.apiUser,
      apiKey: integration.apiKey,
      domain,
    };
  }

  async function getRequiredProviderConfig() {
    const providerConfig = await getOptionalProviderConfig();

    if (!providerConfig) {
      forgeDebug({
        scope: 'migadu-manager',
        level: 'warn',
        message:
          '[migadu-manager] getRequiredProviderConfig: Migadu email provisioning not configured',
      });
      throw new Error(
        'Migadu email provisioning requires a configured admin connection in system integrations',
      );
    }

    return providerConfig;
  }

  function buildProviderCredentials(
    address: string,
    password: string,
  ): ProviderCredentialsMap['email'] {
    return {
      imap: {
        host: MIGADU_IMAP_HOST,
        port: MIGADU_IMAP_PORT,
        secure: MIGADU_IMAP_SECURE,
        user: address,
        password,
      },
      smtp: {
        host: MIGADU_SMTP_HOST,
        port: MIGADU_SMTP_PORT,
        secure: MIGADU_SMTP_SECURE,
        user: address,
        password,
      },
    };
  }

  function buildUrl(providerConfig: { apiBaseUrl: string }, path: string) {
    return new URL(
      path.replace(/^\//, ''),
      withTrailingSlash(providerConfig.apiBaseUrl),
    ).toString();
  }

  function buildHeaders(providerConfig: { apiUser: string; apiKey: string }) {
    return {
      Authorization: `Basic ${Buffer.from(`${providerConfig.apiUser}:${providerConfig.apiKey}`).toString('base64')}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  return {
    isConfigured,
    provisionMailbox,
    deleteAgentMailbox,
    deleteMailboxByAddress,
  };
}

function withTrailingSlash(value: string) {
  return value.endsWith('/') ? value : `${value}/`;
}

function buildMailboxLocalPart(agentId: string) {
  const normalized = agentId
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!normalized) {
    forgeDebug({
      scope: 'migadu-manager',
      level: 'warn',
      message: '[migadu-manager] buildMailboxLocalPart: cannot derive local part from agent id',
    });
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
    forgeDebug({
      scope: 'migadu-manager',
      level: 'warn',
      message: '[migadu-manager] getLocalPart: invalid address format',
    });
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
