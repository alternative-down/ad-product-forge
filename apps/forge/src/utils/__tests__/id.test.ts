import { describe, it, expect } from 'vitest';
import { createId } from '../id';

describe('createId', () => {
  it('should generate a valid UUID v4', () => {
    const id = createId();
    // UUID v4 pattern: 8-4-4-4-12 characters
    const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(id).toMatch(uuidV4Pattern);
  });

  it('should generate unique IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(createId());
    }
    expect(ids.size).toBe(100);
  });

  it('should return a string', () => {
    const id = createId();
    expect(typeof id).toBe('string');
  });

  it('should return a non-empty string', () => {
    const id = createId();
    expect(id.length).toBeGreaterThan(0);
  });
});
