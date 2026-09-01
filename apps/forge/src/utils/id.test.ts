/**
 * Unit tests for utils/id.ts.
 * createId — crypto.randomUUID() wrapper.
 * Zero prior coverage.
 */
import { describe, expect, it } from 'vitest';
import { createId } from './id';

// mock crypto at test level — safe since createId has no test infrastructure
const crypto = await import('node:crypto');

describe('createId', () => {
  it('returns a string', () => {
    expect(typeof createId()).toBe('string');
  });

  it('returns a non-empty string', () => {
    expect(createId().length).toBeGreaterThan(0);
  });

  it('returns a UUID format (8-4-4-4-12 hex)', () => {
    expect(createId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('returns lowercase UUID', () => {
    expect(createId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('each call returns a unique value', () => {
    const ids = new Set([createId(), createId(), createId(), createId(), createId()]);
    expect(ids.size).toBe(5);
  });

  it('works for multiple consecutive calls', () => {
    for (let i = 0; i < 10; i++) {
      expect(createId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    }
  });
});
