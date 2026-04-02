const ADMIN_API_KEY_HEADER = 'x-forge-admin-api-key';

import { getStoredAdminSecret } from '@/lib/admin-secret';

function stripTrailingSlash(value: string) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function getConfiguredApiBaseUrl() {
  const configuredBaseUrl = import.meta.env.VITE_FORGE_API_BASE_URL?.trim();

  if (configuredBaseUrl) {
    return stripTrailingSlash(configuredBaseUrl);
  }

  if (typeof window === 'undefined') {
    return '';
  }

  const { protocol, hostname, port } = window.location;

  if (hostname.startsWith('forge-admin.')) {
    return `${protocol}//forge.${hostname.slice('forge-admin.'.length)}`;
  }

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `${protocol}//${hostname}:${port || '3011'}`;
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

async function request<TResponse>(path: string, init?: RequestInit) {
  const secret = getStoredAdminSecret();
  const response = await fetch(buildApiUrl(path), {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(secret ? { [ADMIN_API_KEY_HEADER]: secret } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let message = 'Não foi possível concluir a operação.';

    try {
      const payload = (await response.json()) as { error?: string };
      message = payload.error ?? message;
    } catch {
      // Keep default message.
    }

    throw new Error(message);
  }

  return response.json() as Promise<TResponse>;
}

export type SystemSettings = {
  companyName: string;
  companyContext: string;
  stepDelayEnabled: boolean;
};

export function getSystemSettings() {
  return request<SystemSettings>('/admin/system/settings');
}

export function upsertSystemSettings(input: SystemSettings) {
  return request<SystemSettings>('/admin/system/settings/upsert', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function validateAdminSecret(secret: string) {
  const response = await fetch(buildApiUrl('/admin/overview'), {
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

  let message = 'Não foi possível validar a chave.';

  try {
    const payload = (await response.json()) as { error?: string };
    message = payload.error ?? message;
  } catch {
    // Keep default message.
  }

  return {
    valid: false as const,
    message,
  };
}
