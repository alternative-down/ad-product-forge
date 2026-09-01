import { describe, expect, it } from 'vitest';
import { toForgeSafeIdentifier } from './safe-identifier';

describe('toForgeSafeIdentifier', () => {
  it('returns the input unchanged when already safe', () => {
    expect(toForgeSafeIdentifier('validName')).toBe('validName');
    expect(toForgeSafeIdentifier('my_agent_42')).toBe('my_agent_42');
    expect(toForgeSafeIdentifier('_private')).toBe('_private');
  });

  it('replaces non-alphanumeric characters with underscores', () => {
    expect(toForgeSafeIdentifier('my-agent')).toBe('my_agent');
    expect(toForgeSafeIdentifier('file@name')).toBe('file_name');
    expect(toForgeSafeIdentifier('path/to/file')).toBe('path_to_file');
  });

  it('strips all non-alphanumeric characters', () => {
    expect(toForgeSafeIdentifier('foo!bar?baz')).toBe('foo_bar_baz');
    expect(toForgeSafeIdentifier('hello.world')).toBe('hello_world');
    expect(toForgeSafeIdentifier('a+b*c')).toBe('a_b_c');
  });

  it('replaces each unsafe char with exactly one underscore', () => {
    expect(toForgeSafeIdentifier('a--b')).toBe('a__b');
    expect(toForgeSafeIdentifier('a...b')).toBe('a___b');
    expect(toForgeSafeIdentifier('foo!!bar')).toBe('foo__bar');
  });

  it('prepends underscore when input starts with a digit', () => {
    expect(toForgeSafeIdentifier('42dogs')).toBe('_42dogs');
    expect(toForgeSafeIdentifier('1')).toBe('_1');
  });

  it('prepends underscore when input starts with digit or unsafe non-underscore char', () => {
    expect(toForgeSafeIdentifier('9abc')).toBe('_9abc');
  });

  it('returns underscore(s) when all chars are unsafe', () => {
    expect(toForgeSafeIdentifier('---')).toBe('___');
    expect(toForgeSafeIdentifier('...')).toBe('___');
  });

  it('handles empty string', () => {
    expect(toForgeSafeIdentifier('')).toBe('_');
  });

  it('handles already-safe identifiers with leading digit', () => {
    expect(toForgeSafeIdentifier('agent42')).toBe('agent42');
    expect(toForgeSafeIdentifier('123abc')).toBe('_123abc');
  });

  it('handles mixed safe and unsafe characters', () => {
    expect(toForgeSafeIdentifier('hello-world_foo')).toBe('hello_world_foo');
    expect(toForgeSafeIdentifier('my.agent-v2')).toBe('my_agent_v2');
    // . -> _, - -> _, v2 stays v2
  });
});
