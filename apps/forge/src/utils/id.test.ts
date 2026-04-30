import { describe, expect, it } from 'vitest';

import { createId } from './id.js';

describe('createId', () => {
  it('returns a non-empty string', () => {
    const id = createId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('returns a valid UUID format (8-4-4-4-12)', () => {
    const id = createId();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    expect(id).toMatch(uuidRegex);
  });

  it('returns lowercase hex characters', () => {
    const id = createId();
    expect(id).toBe(id.toLowerCase());
  });

  it('generates unique IDs on repeated calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(createId());
    }
    // All 100 should be unique
    expect(ids.size).toBe(100);
  });

  it('length is 36 characters', () => {
    const id = createId();
    expect(id.length).toBe(36);
  });
});
