/**
 * Pure helper functions for Coolify API integration.
 * Extracted from coolify/manager.ts to enable independent unit testing
 * and reduce the surface area of the main manager module.
 *
 * No external dependencies beyond zod — fully testable without HTTP mocking.
 */

import { forgeDebug } from '@forge-runtime/core';
import z from 'zod';
import { ApplicationSchema, ApplicationEnvSchema } from './schemas';

export function normalizeDomainHost(value: string | null | undefined): string | null {
  // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return null;
  }

  const normalized = /^[a-z]+:\/\//i.test(trimmed)
    ? new URL(trimmed).host
    : trimmed.replace(/^\./, '').replace(/\/+$/, '');

  return normalized ?? null;
}

export function extractCollection<T>(data: unknown, schema: z.ZodSchema<T>): T[] {
  if (Array.isArray(data)) {
    return z.array(schema).parse(data);
  }

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;

    for (const key of [
      'data',
      'applications',
      'github_apps',
      'repositories',
      'deployments',
      'envs',
      'projects',
      'environments',
      'servers',
      'branches',
    ]) {
      if (Array.isArray(record[key])) {
        return z.array(schema).parse(record[key]);
      }
    }
  }

  return [];
}

export function extractItem<T>(data: unknown, schema: z.ZodSchema<T>): T {
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;

    for (const key of [
      'deployment',
      'application',
      'github_app',
      'server',
      'project',
      'environment',
      'env',
      'data',
    ]) {
      const value = record[key];

      if (value !== null && value !== undefined && typeof value === 'object') {
        return schema.parse(value);
      }
    }

    const parsed = schema.safeParse(data);
    if (parsed.success) {
      return parsed.data;
    }

    forgeDebug({ scope: 'coolify-helpers', level: 'warn', message: 'extractCollection: failed to extract item', context: { dataType: typeof data } });
    forgeDebug({ scope: 'coolify-helpers', level: 'warn', message: 'extractItem: failed to extract item', context: { dataType: typeof data } });
  throw new Error(`Failed to extract item from: ${JSON.stringify(data)}`);
  }

  forgeDebug({ scope: 'coolify-helpers', level: 'warn', message: 'extractItem: failed to extract item', context: { dataType: typeof data } });
  throw new Error(`Failed to extract item from: ${JSON.stringify(data)}`);
}

export function extractLogs(data: unknown): string {
  if (typeof data === 'string') {
    return data;
  }

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;

    for (const key of ['logs', 'data', 'output']) {
      const value = record[key];

      if (typeof value === 'string') {
        return value;
      }
    }
  }

  return '';
}

export function removeUndefined(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

export function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    forgeDebug({
      scope: 'coolify/manager',
      level: 'warn',
      message: 'Failed to parse JSON',
      context: { error, text: text.substring(0, 100) },
    });
    return text;
  }
}

export function buildRequestError(
  method: string,
  path: string,
  status: number,
  data: unknown,
): string {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  return `Coolify API ${method} ${path} failed with ${status}: ${payload}`;
}

export function toTimestamp(value: string | number | null): number {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const numeric = Number(value);

    if (Number.isFinite(numeric)) {
      return numeric;
    }

    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _toApplicationSummary(
  application: z.infer<typeof ApplicationSchema>,
) {
  return {
    applicationUuid: application.uuid,
    name: application.name ?? null,
    fqdn: application.fqdn ?? null,
    status: application.status ?? null,
    repository: application.repository ?? null,
    branch: application.git_branch ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _toApplicationDetails(
  application: z.infer<typeof ApplicationSchema>,
) {
  return {
    applicationUuid: application.uuid,
    name: application.name ?? null,
    fqdn: application.fqdn ?? null,
    status: application.status ?? null,
    repository: application.repository ?? null,
    branch: application.git_branch ?? null,
    port: application.ports_exposes ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _toEnvDetails(
  env: z.infer<typeof ApplicationEnvSchema>,
) {
  return {
    envId: env.uuid ?? env.id ?? env.key,
    key: env.key,
    value: env.value ?? '',
    isPreview: env.is_preview ?? false,
    isBuildTime: env.is_build_time ?? false,
    isLiteral: env.is_literal ?? false,
    isMultiline: env.is_multiline ?? false,
    isShownOnce: env.is_shown_once ?? false,
  };
}
