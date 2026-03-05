import { describe, expect, it } from 'vitest';
import { hello } from '../src/index';

describe('hello', () => {
  it('returns greeting', () => {
    expect(hello('nicolas')).toBe('hello, nicolas');
  });
});
