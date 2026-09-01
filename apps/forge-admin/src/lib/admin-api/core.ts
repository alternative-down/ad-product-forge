import { getStoredAdminSecret } from '@/lib/admin-secret';
import { logger } from '@/lib/logger';

const ADMIN_API_KEY_HEADER = 'x-forge-admin-api-key';

function stripTrailingSlash(value: string) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function getConfiguredApiBaseUrl() {
  const configuredBaseUrl = import.meta.env.VITE_FORGE_API_BASE_URL?.trim();

  if (configuredBaseUrl) {
    return stripTrailingSlash(configuredBaseUrl);
  }

  return '';
}

function buildApiUrl(path: string) {
  const baseUrl = getConfiguredApiBaseUrl();

  if (!baseUrl) {
    return path;
  }

  return `${baseUrl}${path}`;
}

async function extractErrorMessage(
  path: string,
  response: Response,
  defaultMessage: string,
): Promise<string> {
  const rawText = await response.text();
  try {
    const payload = JSON.parse(rawText) as { error?: string };
    return payload.error ?? defaultMessage;
  } catch {
    logger.warn(`admin-api: ${path}: non-JSON error response (${response.status})`, rawText);
    return defaultMessage;
  }
}

async function throwIfNotOk(
  path: string,
  response: Response,
  defaultMessage: string,
): Promise<void> {
  if (response.ok) return;
  const message = await extractErrorMessage(path, response, defaultMessage);
  throw new Error(message);
}

export async function request<TResponse>(path: string, init?: RequestInit) {
  const secret = getStoredAdminSecret();
  const response = await fetch(buildApiUrl(path), {
    ...init,
    cache: 'no-store',
    headers: {
      'content-type': 'application/json',
      ...(secret ? { [ADMIN_API_KEY_HEADER]: secret } : {}),
      ...(init?.headers ?? {}),
    },
  });

  await throwIfNotOk(path, response, 'Não foi possível concluir a operação.');

  return JSON.parse(await response.text()) as TResponse;
}

export async function requestBlob(path: string, init?: RequestInit) {
  const secret = getStoredAdminSecret();
  const response = await fetch(buildApiUrl(path), {
    ...init,
    cache: 'no-store',
    headers: {
      ...(secret ? { [ADMIN_API_KEY_HEADER]: secret } : {}),
      ...(init?.headers ?? {}),
    },
  });

  await throwIfNotOk(path, response, 'Não foi possível concluir a operação.');

  return response.blob();
}

export async function validateAdminSecret(secret: string) {
  const response = await fetch(buildApiUrl('/admin/overview'), {
    cache: 'no-store',
    headers: {
      'content-type': 'application/json',
      [ADMIN_API_KEY_HEADER]: secret.trim(),
    },
  });

  if (response.ok) {
    return {
      valid: true as const,
      message: null,
    };
  }

  const message = await extractErrorMessage(
    '/admin/overview',
    response,
    'Não foi possível validar a chave.',
  );

  return {
    valid: false as const,
    message,
  };
}
