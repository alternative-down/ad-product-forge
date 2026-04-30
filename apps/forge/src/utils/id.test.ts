import { describe, expect, it } from 'vitest';
import { createId } from './id';

// Note: crypto.randomUUID is a real system call, so we can't mock it in unit tests.
// We verify the shape and properties of the returned value.
describe('createId', () => {
  it('returns a string', () => {
    const id = createId();
    expect(typeof id).toBe('string');
  });

  it('returns a non-empty string', () => {
    const id = createId();
    expect(id.length).toBeGreaterThan(0);
  });

  it('returns different values on each call', () => {
    const ids = new Set([createId(), createId(), createId(), createId()]);
    expect(ids.size).toBe(4);
  });

  it('returns a valid UUID format (8-4-4-4-12 hex)', () => {
    const id = createId();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(id).toMatch(uuidRegex);
  });

  it('UUID is lowercase hex characters', () => {
    const id = createId();
    expect(id).toMatch(/^[0-9a-f-]+$/);
  });

  it('length is 36 characters', () => {
    const id = createId();
    expect(id).toHaveLength(36);
  });
});
