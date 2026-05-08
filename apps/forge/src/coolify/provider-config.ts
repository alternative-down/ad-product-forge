/**
 * Coolify provider configuration and base domain resolution.
 * Extracted from coolify/manager.ts to isolate config concerns.
 */

import { z } from 'zod';
import { forgeDebug } from '@forge-runtime/core';

import { normalizeDomainHost } from './helpers';
import { ServerSchema } from './schemas';
import type { createSystemIntegrationStore } from '../system-integrations/store';

export interface ProviderConfig {
  baseUrl: string;
  adminToken: string;
  serverId: string;
  destinationId: string;
  applicationsBaseDomain: string | null;
}

export async function getProviderConfig(
  integrations: ReturnType<typeof createSystemIntegrationStore>,
): Promise<ProviderConfig> {
  const integration = await integrations.getCoolifyConfig();

  if (!integration) {
      forgeDebug({ scope: "coolify", level: "warn", message: "getProviderConfig: Coolify integration not configured" });
    throw new Error(
      'Coolify integration requires a configured admin connection in system integrations',
    );
  }

  return {
    baseUrl: `${integration.baseUrl.replace(/\/$/, '')}/api/v1`,
    adminToken: integration.adminToken,
    serverId: integration.serverId,
    destinationId: integration.destinationId,
    applicationsBaseDomain: normalizeDomainHost(integration.applicationsBaseDomain) ?? null,
  };
}

/**
 * Resolve the base domain for Coolify application hostnames.
 * Uses the server's wildcard_domain if no override is provided.
 */
export async function getApplicationsBaseDomain(
  requestJson: (method: string, path: string) => Promise<unknown>,
  getDefaultServer: () => Promise<z.infer<typeof ServerSchema>>,
  serverUuid?: string,
): Promise<string> {
  try {
    const server = serverUuid
      ? extractServer(await requestJson('GET', `/servers/${encodeURIComponent(serverUuid)}`))
      : await getDefaultServer();
    const wildcardDomain = normalizeDomainHost(server.wildcard_domain);

    if (!wildcardDomain) {
      forgeDebug({ scope: "coolify", level: "warn", message: "getWildcardDomain: wildcard domain not found in server config" });
      throw new Error(
        'Coolify integration could not determine a wildcard domain from the server configuration',
      );
    }

    return wildcardDomain;
  } catch (error) {
    forgeDebug({ scope: 'coolify', level: 'error', message: 'Coolify provider config failed', context: { error } });
    throw new Error(
      `Failed to resolve Coolify applications base domain: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function extractServer(data: unknown): z.infer<typeof ServerSchema> {
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    const server = (record.data ?? record.server ?? record) as Record<string, unknown>;
    return ServerSchema.parse(server);
  }
  return ServerSchema.parse(data);
}