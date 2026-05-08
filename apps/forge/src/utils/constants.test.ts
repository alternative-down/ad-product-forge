/**
 * Unit tests for utils/constants.ts.
 * Shared constants for agent context and runner operations.
 * Zero prior coverage.
 */
import { describe, expect, it } from 'vitest';
import {
  AGENT_CONTEXT_FILE_PATH,
  AGENT_CONTEXT_WARNING_CHAR_LIMIT,
} from './constants';

describe('AGENT_CONTEXT_FILE_PATH', () => {
  it('is set to AGENT_CONTEXT.md', () => {
    expect(AGENT_CONTEXT_FILE_PATH).toBe('AGENT_CONTEXT.md');
  });
});

describe('AGENT_CONTEXT_WARNING_CHAR_LIMIT', () => {
  it('is 8000', () => {
    expect(AGENT_CONTEXT_WARNING_CHAR_LIMIT).toBe(8_000);
  });

  it('is a positive integer', () => {
    expect(AGENT_CONTEXT_WARNING_CHAR_LIMIT).toBeGreaterThan(0);
    expect(Number.isInteger(AGENT_CONTEXT_WARNING_CHAR_LIMIT)).toBe(true);
  });
});