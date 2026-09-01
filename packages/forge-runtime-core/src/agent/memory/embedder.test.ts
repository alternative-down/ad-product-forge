import { describe, expect, it } from 'vitest';
import {
  WORKSPACE_EMBEDDER_IDS,
  isWorkspaceEmbedderId,
  resolveWorkspaceEmbedderId,
} from './embedder';

describe('WORKSPACE_EMBEDDER_IDS', () => {
  it('contains three valid embedder IDs', () => {
    expect(WORKSPACE_EMBEDDER_IDS).toEqual([
      'fastembed',
      'transformers-multilingual-e5-small',
      'transformers-multilingual-e5-small-cpu',
    ]);
  });
});

describe('isWorkspaceEmbedderId', () => {
  it('returns true for fastembed', () => {
    expect(isWorkspaceEmbedderId('fastembed')).toBe(true);
  });

  it('returns true for transformers-multilingual-e5-small', () => {
    expect(isWorkspaceEmbedderId('transformers-multilingual-e5-small')).toBe(true);
  });

  it('returns true for transformers-multilingual-e5-small-cpu', () => {
    expect(isWorkspaceEmbedderId('transformers-multilingual-e5-small-cpu')).toBe(true);
  });

  it('returns false for unknown string', () => {
    expect(isWorkspaceEmbedderId('unknown-embedder')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isWorkspaceEmbedderId('')).toBe(false);
  });

  it('returns false for arbitrary strings', () => {
    expect(isWorkspaceEmbedderId('openai')).toBe(false);
    expect(isWorkspaceEmbedderId('bert')).toBe(false);
  });
});

describe('resolveWorkspaceEmbedderId', () => {
  it('returns the valid value unchanged', () => {
    expect(resolveWorkspaceEmbedderId('fastembed')).toBe('fastembed');
    expect(resolveWorkspaceEmbedderId('transformers-multilingual-e5-small')).toBe(
      'transformers-multilingual-e5-small',
    );
  });

  it('returns fastembed as default for null', () => {
    expect(resolveWorkspaceEmbedderId(null)).toBe('fastembed');
  });

  it('returns fastembed as default for undefined', () => {
    expect(resolveWorkspaceEmbedderId(undefined)).toBe('fastembed');
  });

  it('returns fastembed as default for empty string', () => {
    expect(resolveWorkspaceEmbedderId('')).toBe('fastembed');
  });

  it('returns fastembed as default for unknown embedder ID', () => {
    expect(resolveWorkspaceEmbedderId('unknown')).toBe('fastembed');
  });

  it('returns fastembed as default for non-string values', () => {
    expect(resolveWorkspaceEmbedderId(42 as any)).toBe('fastembed');
  });
});
