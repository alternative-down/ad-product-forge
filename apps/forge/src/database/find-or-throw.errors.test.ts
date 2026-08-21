import { describe, expect, it } from 'vitest';

import { FindOrThrowEntityNotFoundError } from './find-or-throw.errors';

describe('FindOrThrowEntityNotFoundError', () => {
  it('preserves verbatim message format', () => {
    const err = new FindOrThrowEntityNotFoundError('agent', 'a1');
    expect(err).toBeInstanceOf(FindOrThrowEntityNotFoundError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('FindOrThrowEntityNotFoundError');
    expect(err.code).toBe('FIND_OR_THROW_ENTITY_NOT_FOUND');
    expect(err.entity).toBe('agent');
    expect(err.idValue).toBe('a1');
    expect(err.message).toBe('agent not found: a1');
    expect(err.stack).toBeDefined();
  });

  it('handles LLM profile case (settings-store caller)', () => {
    const err = new FindOrThrowEntityNotFoundError('LLM profile', 'missing-primary');
    expect(err.entity).toBe('LLM profile');
    expect(err.idValue).toBe('missing-primary');
    expect(err.message).toBe('LLM profile not found: missing-primary');
  });

  it('handles uuid-style idValue', () => {
    const err = new FindOrThrowEntityNotFoundError(
      'agent',
      'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    );
    expect(err.message).toBe(
      'agent not found: a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    );
    expect(err.idValue).toBe(
      'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    );
  });
});
