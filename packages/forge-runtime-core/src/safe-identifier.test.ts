import { describe, expect, it } from 'vitest';

import { toForgeSafeIdentifier } from './safe-identifier.js';

describe('toForgeSafeIdentifier', () => {
  it('passes alphanumeric characters through unchanged', () => {
    expect(toForgeSafeIdentifier('helloWorld')).toBe('helloWorld');
  });

  it('preserves underscores in the input', () => {
    expect(toForgeSafeIdentifier('hello_world')).toBe('hello_world');
  });

  it('replaces non-alphanumeric characters with underscores', () => {
    expect(toForgeSafeIdentifier('hello-world')).toBe('hello_world');
    expect(toForgeSafeIdentifier('hello.world')).toBe('hello_world');
  });

  it('replaces spaces with underscores', () => {
    expect(toForgeSafeIdentifier('hello world')).toBe('hello_world');
  });

  it('replaces multiple consecutive special characters with single underscores', () => {
    expect(toForgeSafeIdentifier('hello---world')).toBe('hello___world');
  });

  it('prepends underscore when input starts with a digit', () => {
    expect(toForgeSafeIdentifier('123abc')).toBe('_123abc');
  });

  it('keeps input that already starts with underscore', () => {
    expect(toForgeSafeIdentifier('_hello')).toBe('_hello');
  });

  it('handles mixed special characters', () => {
    expect(toForgeSafeIdentifier('hello@world!test')).toBe('hello_world_test');
  });

  it('prepends underscore for empty string since normalized result does not start with letter/underscore', () => {
    expect(toForgeSafeIdentifier('')).toBe('_');
  });

  it('does not add trailing underscore when input ends with special char', () => {
    expect(toForgeSafeIdentifier('hello!')).toBe('hello_');
  });
});
