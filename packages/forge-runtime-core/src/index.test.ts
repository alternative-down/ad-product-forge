import { describe, expect, it } from 'vitest';

import {
  appendWorkingMemoryInstructions,
  forgeDebug,
  isForgeDebugEnabled,
  resolveWorkspaceEmbedderId,
  toMastraSafeIdentifier,
} from './index.js';

describe('@forge-runtime/core', () => {
  it('exports identifier and debug helpers', () => {
    expect(toMastraSafeIdentifier('Meraxis Runtime')).toBe('Meraxis_Runtime');
    expect(typeof forgeDebug).toBe('function');
    expect(typeof isForgeDebugEnabled()).toBe('boolean');
  });

  it('exports working memory and embedder helpers', () => {
    expect(resolveWorkspaceEmbedderId('transformers-multilingual-e5-small')).toBe('transformers-multilingual-e5-small');
    expect(resolveWorkspaceEmbedderId('invalid')).toBe('fastembed');
    expect(appendWorkingMemoryInstructions('base')).toContain('base');
  });
});
