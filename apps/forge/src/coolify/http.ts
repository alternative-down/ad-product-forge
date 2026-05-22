/**
 * HTTP transport layer for Coolify API.
 * Extracted from coolify/manager.ts to separate transport concerns.
 */

import { forgeDebug } from '@forge-runtime/core';
import { serializeError } from '../agents/agent-runner-error-formatting';
import { removeUndefined, safeJsonParse, buildRequestError } from './helpers';
import { getProviderConfig } from './provider-config';
import type { createSystemIntegrationStore } from '../system-integrations/store';

export interface HttpTransportConfig {
  integrations: ReturnType<typeof createSystemIntegrationStore>;
}

export function createHttpTransport(config: HttpTransportConfig) {
  async function requestJson(method: string, path: string, body?: Record<string, unknown>) {
    let providerConfig;
    try {
      providerConfig = await getProviderConfig(config.integrations);
    } catch (err) {
      forgeDebug({
        scope: 'coolify',
        level: 'error',
        message: 'requestJson: getProviderConfig failed',
        context: { method, path, error: String(serializeError(err)) },
      });
      throw err;
    }
    let response;
    try {
      response = await fetch(`${providerConfig.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${providerConfig.adminToken}`,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(removeUndefined(body)) : undefined,
      });
    } catch (err) {
      forgeDebug({
        scope: 'coolify',
        level: 'error',
        message: 'requestJson: fetch failed',
        context: { method, path, error: String(serializeError(err)) },
      });
      throw err;
    }

    let text;
    try {
      text = await response.text();
    } catch (err) {
      forgeDebug({
        scope: 'coolify',
        level: 'error',
        message: 'requestJson: response.text() failed',
        context: { method, path, error: String(serializeError(err)) },
      });
      throw err;
    }
    const data = text.length > 0 ? safeJsonParse(text) : null;

    if (!response.ok) {
      forgeDebug({
        scope: 'coolify',
        level: 'error',
        message: 'requestJson: HTTP error',
        context: { method, path, status: response.status },
      });
      throw new Error(buildRequestError(method, path, response.status, data ?? text));
    }

    return data;
  }

  return { requestJson };
}

export type HttpTransport = ReturnType<typeof createHttpTransport>;