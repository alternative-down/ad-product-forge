import { describe, expect, it } from 'vitest';

import {
  ForgeMcpToolset,
  InMemoryForgeUsageSink,
  forgeDebug,
  isForgeDebugEnabled,
  resolveWorkspaceEmbedderId,
  toForgeSafeIdentifier,
} from './index.js';

describe('@forge-runtime/core', () => {
  it('exports identifier and debug helpers', () => {
    expect(toForgeSafeIdentifier('Meraxis Runtime')).toBe('Meraxis_Runtime');
    expect(typeof forgeDebug).toBe('function');
    expect(typeof isForgeDebugEnabled()).toBe('boolean');
  });

  it('exports runtime-facing helpers', () => {
    expect(resolveWorkspaceEmbedderId('transformers-multilingual-e5-small')).toBe('transformers-multilingual-e5-small');
    expect(resolveWorkspaceEmbedderId('invalid')).toBe('fastembed');
    expect(new InMemoryForgeUsageSink().list()).toEqual([]);
    expect(typeof ForgeMcpToolset).toBe('function');
  });
});
