/**
 * Unit tests for utils/constants.ts.
 * Shared constants for agent context limits and paths.
 * Zero prior coverage.
 */
import { describe, expect, it } from 'vitest';
import { AGENT_CONTEXT_FILE_PATH, AGENT_CONTEXT_WARNING_CHAR_LIMIT } from './constants';

describe('AGENT_CONTEXT_FILE_PATH', () => {
  it('is a non-empty string', () => {
    expect(typeof AGENT_CONTEXT_FILE_PATH).toBe('string');
    expect(AGENT_CONTEXT_FILE_PATH.length).toBeGreaterThan(0);
  });

  it('is AGENT_CONTEXT.md', () => {
    expect(AGENT_CONTEXT_FILE_PATH).toBe('AGENT_CONTEXT.md');
  });

  it('has .md extension', () => {
    expect(AGENT_CONTEXT_FILE_PATH).toMatch(/\.md$/);
  });
});

describe('AGENT_CONTEXT_WARNING_CHAR_LIMIT', () => {
  it('is a positive number', () => {
    expect(AGENT_CONTEXT_WARNING_CHAR_LIMIT).toBeGreaterThan(0);
  });

  it('equals 8000', () => {
    expect(AGENT_CONTEXT_WARNING_CHAR_LIMIT).toBe(8_000);
  });

  it('is greater than typical message length', () => {
    expect(AGENT_CONTEXT_WARNING_CHAR_LIMIT).toBeGreaterThan(500);
  });
});

describe('constants relationship', () => {
  it('AGENT_CONTEXT_FILE_PATH is a valid filename', () => {
    expect(AGENT_CONTEXT_FILE_PATH).toMatch(/^[A-Za-z0-9_.-]+$/);
  });

  it('AGENT_CONTEXT_WARNING_CHAR_LIMIT is a round number', () => {
    expect(AGENT_CONTEXT_WARNING_CHAR_LIMIT % 1000).toBe(0);
  });
});
