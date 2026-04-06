const ADMIN_SECRET_STORAGE_KEY = 'forgeAdminSecret';
const ADMIN_THEME_STORAGE_KEY = 'forge-admin-theme';

export function getStoredAdminSecret() {
  if (typeof window === 'undefined') {
    return '';
  }

  return window.localStorage.getItem(ADMIN_SECRET_STORAGE_KEY)?.trim() ?? '';
}

export function setStoredAdminSecret(value: string) {
  if (typeof window === 'undefined') {
    return;
  }

  const nextValue = value.trim();

  if (nextValue) {
    window.localStorage.setItem(ADMIN_SECRET_STORAGE_KEY, nextValue);
    return;
  }

  window.localStorage.removeItem(ADMIN_SECRET_STORAGE_KEY);
}

export function getStoredAdminTheme() {
  if (typeof window === 'undefined') {
    return 'light' as const;
  }

  return window.localStorage.getItem(ADMIN_THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
}

export function setStoredAdminTheme(theme: 'light' | 'dark') {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(ADMIN_THEME_STORAGE_KEY, theme);
}
