/**
 * Error mapping for Coolify API.
 * Extracted from coolify/manager.ts to centralize error handling.
 */

import { forgeDebug } from '@forge-runtime/core';
import { errorMsg } from '../agents/error-formatting';
import { buildRequestError } from './helpers';

interface CoolifyErrorContext {
  scope?: string;
  operation: string;
  method?: string;
  path?: string;
  error?: unknown;
}

export function mapCoolifyError(context: CoolifyErrorContext): Error {
  const { scope = 'coolify', operation, method, path, error } = context;

  forgeDebug({
    scope,
    level: 'error',
    message: `${operation} failed`,
    context: { method, path, error: errorMsg(error) },
  });

  if (error instanceof Error) {
    return error;
  }

  return new Error(`${operation} failed: ${errorMsg(error)}`);
}

function mapHttpError(method: string, path: string, status: number, data: unknown): Error {
  return new Error(buildRequestError(method, path, status, data));
}

// Unexported in E9 — defined but never called (zero internal + zero external usages). Kept for future use; remove if no callers within D70.
function mapProviderConfigError(operation: string, error: unknown): Error {
  forgeDebug({
    scope: 'coolify',
    level: 'error',
    message: `${operation}: getProviderConfig failed`,
    context: { error: errorMsg(error) },
  });
  if (error instanceof Error) {
    return error;
  }
  return new Error(`${operation} failed: ${errorMsg(error)}`);
}
// ── Pattern L D51 #6502 batch 13: typed Errors for coolify/manager.ts ──
// See apps/forge/src/coolify/manager.ts for the source throw sites.
// Message strings preserved verbatim for backward compatibility with
// manager.test.ts string-based assertions.

export class CoolifyHealthProbeError extends Error {
  readonly code = 'COOLIFY_HEALTH_PROBE' as const;
  readonly status: number;
  constructor(status: number) {
    super(`Health probe returned HTTP ${status}`);
    this.name = 'CoolifyHealthProbeError';
    this.status = status;
  }
}

export class CoolifyVersionProbeError extends Error {
  readonly code = 'COOLIFY_VERSION_PROBE' as const;
  readonly status: number;
  constructor(status: number) {
    super(`Version probe returned HTTP ${status}`);
    this.name = 'CoolifyVersionProbeError';
    this.status = status;
  }
}

export class CoolifyVersionShaMismatchError extends Error {
  readonly code = 'COOLIFY_VERSION_SHA_MISMATCH' as const;
  readonly actualSha: string | null | undefined;
  readonly expectedSha: string;
  constructor(actualSha: string | null | undefined, expectedSha: string) {
    super(
      `x-forge-version header "${actualSha ?? 'null'}" does not match expected sha "${expectedSha}"`,
    );
    this.name = 'CoolifyVersionShaMismatchError';
    this.actualSha = actualSha;
    this.expectedSha = expectedSha;
  }
}

export class CoolifyEnvBulkUpdateMissingKeyError extends Error {
  readonly code = 'COOLIFY_ENV_BULK_UPDATE_MISSING_KEY' as const;
  readonly envKey: string;
  constructor(envKey: string) {
    super(`Coolify API did not return env ${envKey} after bulk update`);
    this.name = 'CoolifyEnvBulkUpdateMissingKeyError';
    this.envKey = envKey;
  }
}

// ── Pattern L D51 #6502 batch 18: typed Errors for coolify/provider-config.ts ──
// See apps/forge/src/coolify/provider-config.ts for the source throw sites.
// Message strings preserved verbatim for backward compatibility with
// provider-config.test.ts string-based assertions.

export class CoolifyProviderConfigMissingIntegrationError extends Error {
  readonly code = 'COOLIFY_PROVIDER_CONFIG_MISSING_INTEGRATION' as const;
  constructor() {
    super('Coolify integration requires a configured admin connection in system integrations');
    this.name = 'CoolifyProviderConfigMissingIntegrationError';
  }
}

export class CoolifyProviderConfigMissingWildcardDomainError extends Error {
  readonly code = 'COOLIFY_PROVIDER_CONFIG_MISSING_WILDCARD_DOMAIN' as const;
  constructor() {
    super(
      'Coolify integration could not determine a wildcard domain from the server configuration',
    );
    this.name = 'CoolifyProviderConfigMissingWildcardDomainError';
  }
}

export class CoolifyProviderConfigResolutionError extends Error {
  readonly code = 'COOLIFY_PROVIDER_CONFIG_RESOLUTION' as const;
  readonly errorMessage: string;
  constructor(errorMessage: string) {
    super(`Failed to resolve Coolify applications base domain: ${errorMessage}`);
    this.name = 'CoolifyProviderConfigResolutionError';
    this.errorMessage = errorMessage;
  }
}

// ── Pattern L D52 #6502 batch coolify/http: typed Errors for coolify/http.ts ──
// See apps/forge/src/coolify/http.ts for the source throw site.
// Message strings preserved verbatim for backward compatibility with
// http.test.ts string-based assertions (rejects.toThrow('404') etc.).

export class CoolifyHttpRequestError extends Error {
  readonly code = 'COOLIFY_HTTP_REQUEST' as const;
  readonly method: string;
  readonly path: string;
  readonly status: number;
  readonly body: unknown;
  constructor(method: string, path: string, status: number, body: unknown) {
    super(buildRequestError(method, path, status, body));
    this.name = 'CoolifyHttpRequestError';
    this.method = method;
    this.path = path;
    this.status = status;
    this.body = body;
  }
}
