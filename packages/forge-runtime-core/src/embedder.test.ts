import { describe, expect, it } from 'vitest';
import {
  isWorkspaceEmbedderId,
  resolveWorkspaceEmbedderId,
  WORKSPACE_EMBEDDER_IDS,
} from './embedder.js';

describe('embedder', () => {
  describe('WORKSPACE_EMBEDDER_IDS', () => {
    it('contains expected embedder identifiers', () => {
      expect(WORKSPACE_EMBEDDER_IDS).toContain('fastembed');
      expect(WORKSPACE_EMBEDDER_IDS).toContain('transformers-multilingual-e5-small');
      expect(WORKSPACE_EMBEDDER_IDS).toContain('transformers-multilingual-e5-small-cpu');
    });

    it('has exactly 3 valid embedder IDs', () => {
      expect(WORKSPACE_EMBEDDER_IDS).toHaveLength(3);
    });

    it('is a readonly tuple', () => {
      expect(WORKSPACE_EMBEDDER_IDS[0]).toBe('fastembed');
      expect(WORKSPACE_EMBEDDER_IDS[1]).toBe('transformers-multilingual-e5-small');
      expect(WORKSPACE_EMBEDDER_IDS[2]).toBe('transformers-multilingual-e5-small-cpu');
    });
  });

  describe('isWorkspaceEmbedderId', () => {
    it('returns true for all valid embedder IDs', () => {
      for (const id of WORKSPACE_EMBEDDER_IDS) {
        expect(isWorkspaceEmbedderId(id)).toBe(true);
      }
    });

    it('returns false for unknown strings', () => {
      expect(isWorkspaceEmbedderId('unknown-embedder')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isWorkspaceEmbedderId('')).toBe(false);
    });

    it('returns false for non-string inputs', () => {
      expect(isWorkspaceEmbedderId(undefined as unknown as string)).toBe(false);
      expect(isWorkspaceEmbedderId(null as unknown as string)).toBe(false);
      expect(isWorkspaceEmbedderId(123 as unknown as string)).toBe(false);
    });

    it('returns false for common typos and variations', () => {
      expect(isWorkspaceEmbedderId('fastembed-cpu')).toBe(false);
      expect(isWorkspaceEmbedderId('transformers-multilingual-e5-small-x86')).toBe(false);
      expect(isWorkspaceEmbedderId('fast-embed')).toBe(false);
    });
  });

  describe('resolveWorkspaceEmbedderId', () => {
    it('returns the given ID when valid', () => {
      expect(resolveWorkspaceEmbedderId('fastembed')).toBe('fastembed');
      expect(resolveWorkspaceEmbedderId('transformers-multilingual-e5-small')).toBe('transformers-multilingual-e5-small');
      expect(resolveWorkspaceEmbedderId('transformers-multilingual-e5-small-cpu')).toBe('transformers-multilingual-e5-small-cpu');
    });

    it('falls back to fastembed for invalid ID', () => {
      expect(resolveWorkspaceEmbedderId('unknown-embedder')).toBe('fastembed');
      expect(resolveWorkspaceEmbedderId('not-a-real-embedder')).toBe('fastembed');
    });

    it('falls back to fastembed for empty string', () => {
      expect(resolveWorkspaceEmbedderId('')).toBe('fastembed');
    });

    it('falls back to fastembed for null', () => {
      expect(resolveWorkspaceEmbedderId(null)).toBe('fastembed');
    });

    it('falls back to fastembed for undefined', () => {
      expect(resolveWorkspaceEmbedderId(undefined)).toBe('fastembed');
    });

    it('returns default fastembed when ID is a truthy non-matching string', () => {
      expect(resolveWorkspaceEmbedderId('custom-embedder')).toBe('fastembed');
    });

    it('has fastembed as the default embedder when nothing is provided', () => {
      // This is the expected default across the system
      expect(resolveWorkspaceEmbedderId(null)).toBe('fastembed');
    });
  });
});
