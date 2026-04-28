import { getStoredAdminSecret } from '@/lib/admin-secret';

const ADMIN_API_KEY_HEADER = 'x-forge-admin-api-key';

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

  if (!response.ok) {
    let message = 'Não foi possível concluir a operação.';

    const rawText = await response.text();
    try {
      const payload = JSON.parse(rawText) as { error?: string };
      message = payload.error ?? message;
    } catch {
      console.warn(`[admin-api] ${path}: non-JSON error response (${response.status})`, rawText);
    }

    throw new Error(message);
  }

  return JSON.parse(await response.text()) as Promise<TResponse>;
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

  if (!response.ok) {
    let message = 'Não foi possível concluir a operação.';

    const rawText = await response.text();
    try {
      const payload = JSON.parse(rawText) as { error?: string };
      message = payload.error ?? message;
    } catch {
      console.warn(`[admin-api] ${path}: non-JSON error response (${response.status})`, rawText);
    }

    throw new Error(message);
  }

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

  let message = 'Não foi possível validar a chave.';

  const rawText = await response.text();
  try {
    const payload = JSON.parse(rawText) as { error?: string };
    message = payload.error ?? message;
  } catch {
    console.warn('[admin-api] /admin/overview: non-JSON error response', rawText);
  }

  return {
    valid: false as const,
    message,
  };
}
