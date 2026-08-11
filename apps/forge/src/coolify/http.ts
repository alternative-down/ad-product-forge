/**
 * HTTP transport layer for Coolify API.
 * Extracted from coolify/manager.ts to separate transport concerns.
 */

import { coolifyHttpDebug } from './http-debug';
import { errorMsg } from '../agents/error-formatting';
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
      coolifyHttpDebug('error', 'requestJson: getProviderConfig failed', { method, path, error: errorMsg(err) });
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
      coolifyHttpDebug('error', 'requestJson: fetch failed', { method, path, error: errorMsg(err) });
      throw err;
    }

    let text;
    try {
      text = await response.text();
    } catch (err) {
      coolifyHttpDebug('error', 'requestJson: response.text() failed', { method, path, error: errorMsg(err) });
      throw err;
    }
    const data = text.length > 0 ? safeJsonParse(text) : null;

    if (!response.ok) {
      coolifyHttpDebug('error', 'requestJson: HTTP error', { method, path, status: response.status });
      throw new Error(buildRequestError(method, path, response.status, data ?? text));
    }

    return data;
  }

  return { requestJson };
}

export type HttpTransport = ReturnType<typeof createHttpTransport>;