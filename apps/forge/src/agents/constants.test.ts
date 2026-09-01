import { describe, expect, it } from 'vitest';
import { AGENT_CONTEXT_FILE_PATH, AGENT_CONTEXT_WARNING_CHAR_LIMIT } from '../utils/constants';

describe('constants', () => {
  it('exports AGENT_CONTEXT_FILE_PATH', () => {
    expect(typeof AGENT_CONTEXT_FILE_PATH).toBe('string');
  });

  it('AGENT_CONTEXT_FILE_PATH is AGENT_CONTEXT.md', () => {
    expect(AGENT_CONTEXT_FILE_PATH).toBe('AGENT_CONTEXT.md');
  });

  it('exports AGENT_CONTEXT_WARNING_CHAR_LIMIT', () => {
    expect(typeof AGENT_CONTEXT_WARNING_CHAR_LIMIT).toBe('number');
  });

  it('AGENT_CONTEXT_WARNING_CHAR_LIMIT is 8000', () => {
    expect(AGENT_CONTEXT_WARNING_CHAR_LIMIT).toBe(8000);
  });
});
