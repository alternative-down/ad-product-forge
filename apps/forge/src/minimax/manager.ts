import { forgeDebug } from '@forge-runtime/core';
const MINIMAX_BASE_URL = 'https://api.minimax.io/v1';

export interface MiniMaxConfig {
  apiKey: string;
}




export interface MiniMaxError {
  code: string;
  message: string;
}

export interface MiniMaxResponse<T> {
  success: boolean;
  data?: T;
  error?: MiniMaxError;
}








type MiniMaxJsonResponse = Record<string, unknown>;

export class MiniMaxClient {
  private readonly apiKey: string;

  constructor(config: MiniMaxConfig) {
    this.apiKey = config.apiKey;
  }

  private buildError(code: string, message: string): MiniMaxResponse<never> {
    return {
      success: false,
      error: { code, message },
    };
  }

  private async requestJson(
    endpoint: string,
    init: RequestInit,
  ): Promise<MiniMaxResponse<MiniMaxJsonResponse>> {
    try {
      const response = await fetch(`${MINIMAX_BASE_URL}${endpoint}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          ...(init.headers ?? {}),
        },
      });
      const rawBody = await response.text();
      const body = rawBody.trim()
        ? (() => {
            try {
              return JSON.parse(rawBody) as MiniMaxJsonResponse;
            } catch (error) {
              forgeDebug({ scope: 'minimax/manager', level: 'warn', message: 'Failed to parse MiniMax response', context: { error } });
              return null;
            }
          })()
        : {};

      if (!response.ok) {
        return this.buildError(
          String(response.status),
          this.extractErrorMessage(body, rawBody, `MiniMax request failed with status ${response.status}`),
        );
      }

      if (!body || Array.isArray(body)) {
        return this.buildError(
          'INVALID_RESPONSE',
          `MiniMax returned an invalid JSON payload for ${endpoint}`,
        );
      }

      const baseResp = this.getObject(body.base_resp);

      if (baseResp) {
        const statusCode = this.getNumber(baseResp.status_code);
        if (statusCode !== undefined && statusCode !== 0) {
          return this.buildError(
            String(statusCode),
            this.getString(baseResp.status_msg) || 'MiniMax returned an error response',
          );
        }
      }

      if (typeof body.baseRespStatusCode === 'number' && body.baseRespStatusCode !== 0) {
        return this.buildError(
          String(body.baseRespStatusCode),
          this.getString(body.baseRespStatusMsg) || 'MiniMax returned an error response',
        );
      }

      return {
        success: true,
        data: body,
      };
    } catch (error) {
      return this.buildError(
        'NETWORK_ERROR',
        error instanceof Error ? error.message : 'Network request failed',
      );
    }
  }

  private extractErrorMessage(
    body: MiniMaxJsonResponse | null,
    rawBody: string,
    fallback: string,
  ) {
    if (!body) {
      return rawBody.trim() || fallback;
    }

    const baseResp = this.getObject(body.base_resp);
    if (baseResp) {
      const message = this.getString(baseResp.status_msg);
      if (message) {
        return message;
      }
    }

    return (
      this.getString(body.status_msg) ||
      this.getString(body.message) ||
      this.getString(body.error) ||
      rawBody.trim() ||
      fallback
    );
  }

  private getObject(value: unknown): Record<string, unknown> | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private getString(value: unknown) {
    return typeof value === 'string' ? value : undefined;
  }

  private getNumber(value: unknown) {
    return typeof value === 'number' ? value : undefined;
  }






}

export function createMiniMaxClient(apiKey?: string): MiniMaxClient {
  const key = apiKey || process.env.MINIMAX_API_KEY;

  if (!key) {
    forgeDebug({ scope: 'minimax-manager', level: 'error', message: 'createMinimaxManager: MINIMAX_API_KEY not set' });
    throw new Error('MINIMAX_API_KEY environment variable is not set');
  }

  return new MiniMaxClient({ apiKey: key });
}

export function createMiniMaxManager(config: {
  integrations: ReturnType<typeof import('../system-integrations/store').createSystemIntegrationStore>;
}) {
  async function getClient() {
    const cfg = await config.integrations.getMinimaxConfig();

    if (!cfg) {
      forgeDebug({ scope: 'minimax/manager', level: 'warn', message: 'getClient MiniMax integration not configured' });
      throw new Error('MiniMax integration is not configured');
    }

    return new MiniMaxClient({ apiKey: cfg.apiKey });
  }







}

export type MiniMaxManager = ReturnType<typeof createMiniMaxManager>;
