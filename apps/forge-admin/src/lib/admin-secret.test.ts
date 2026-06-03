// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getStoredAdminSecret,
  getStoredAdminTheme,
  setStoredAdminSecret,
  setStoredAdminTheme,
} from './admin-secret';

// Provide a minimal `window` shim so the modules under test can call
// `window.localStorage.*` even though we are running under the node
// environment. We deliberately use a plain Map-backed object so the
// implementation cannot tell it apart from a real localStorage.
function createLocalStorageShim(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => (store.has(key) ? (store.get(key) as string) : null),
    key: (index) => Array.from(store.keys())[index] ?? null,
    removeItem: (key) => {
      store.delete(key);
    },
    setItem: (key, value) => {
      store.set(key, String(value));
    },
  } as unknown as Storage;
}

const originalWindow = (globalThis as { window?: unknown }).window;
const originalLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;

beforeEach(() => {
  // Install a fresh in-memory localStorage on globalThis so each test
  // starts from a known state.
  const shim = createLocalStorageShim();
  (globalThis as { window: { localStorage: Storage } }).window = { localStorage: shim };
  (globalThis as { localStorage: Storage }).localStorage = shim;
});

afterEach(() => {
  if (originalWindow === undefined) {
    delete (globalThis as { window?: unknown }).window;
  } else {
    (globalThis as { window: unknown }).window = originalWindow;
  }
  if (originalLocalStorage === undefined) {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  } else {
    (globalThis as { localStorage: unknown }).localStorage = originalLocalStorage;
  }
  vi.restoreAllMocks();
});

describe('getStoredAdminSecret', () => {
  it('returns the stored value trimmed', () => {
    window.localStorage.setItem('forgeAdminSecret', '  hello  ');
    expect(getStoredAdminSecret()).toBe('hello');
  });

  it('returns an empty string when nothing is stored', () => {
    expect(getStoredAdminSecret()).toBe('');
  });

  it('returns an empty string when the stored value is whitespace only', () => {
    window.localStorage.setItem('forgeAdminSecret', '   ');
    expect(getStoredAdminSecret()).toBe('');
  });

  it('returns an empty string when window is undefined (SSR safety)', () => {
    delete (globalThis as { window?: unknown }).window;
    expect(getStoredAdminSecret()).toBe('');
  });
});

describe('setStoredAdminSecret', () => {
  it('writes the trimmed value to localStorage', () => {
    setStoredAdminSecret('  secret  ');
    expect(window.localStorage.getItem('forgeAdminSecret')).toBe('secret');
  });

  it('removes the localStorage entry when given an empty/whitespace string', () => {
    window.localStorage.setItem('forgeAdminSecret', 'existing');
    setStoredAdminSecret('   ');
    expect(window.localStorage.getItem('forgeAdminSecret')).toBeNull();
  });

  it('is a no-op when window is undefined (SSR safety)', () => {
    delete (globalThis as { window?: unknown }).window;
    expect(() => setStoredAdminSecret('value')).not.toThrow();
  });
});

describe('getStoredAdminTheme', () => {
  it('returns "dark" when "dark" is stored', () => {
    window.localStorage.setItem('forge-admin-theme', 'dark');
    expect(getStoredAdminTheme()).toBe('dark');
  });

  it('returns "light" when any other value is stored (defensive default)', () => {
    window.localStorage.setItem('forge-admin-theme', 'auto');
    expect(getStoredAdminTheme()).toBe('light');
  });

  it('returns "light" when nothing is stored', () => {
    expect(getStoredAdminTheme()).toBe('light');
  });

  it('returns "light" when window is undefined (SSR safety)', () => {
    delete (globalThis as { window?: unknown }).window;
    expect(getStoredAdminTheme()).toBe<'light' | 'dark'>('light');
  });
});

describe('setStoredAdminTheme', () => {
  it('writes the theme value verbatim to localStorage', () => {
    setStoredAdminTheme('dark');
    expect(window.localStorage.getItem('forge-admin-theme')).toBe('dark');
    setStoredAdminTheme('light');
    expect(window.localStorage.getItem('forge-admin-theme')).toBe('light');
  });

  it('is a no-op when window is undefined (SSR safety)', () => {
    delete (globalThis as { window?: unknown }).window;
    expect(() => setStoredAdminTheme('dark')).not.toThrow();
  });
});
