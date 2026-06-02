/**
 * Error mapping for Coolify API.
 * Extracted from coolify/manager.ts to centralize error handling.
 */

import { forgeDebug } from '@forge-runtime/core';
import { errorMsg } from '../agents/error-formatting';
import { buildRequestError } from './helpers';

export interface CoolifyErrorContext {
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

export function mapHttpError(
  method: string,
  path: string,
  status: number,
  data: unknown,
): Error {
  return new Error(buildRequestError(method, path, status, data));
}

export function mapProviderConfigError(operation: string, error: unknown): Error {
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