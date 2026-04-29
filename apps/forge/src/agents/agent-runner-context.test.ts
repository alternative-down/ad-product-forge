import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { createContextLoader } from './agent-runner-context.js';

const HOME = '/agent/workspace';

// Create the mock function once, before vi.mock references it.
// vi.hoisted ensures it is defined when the module factory runs.
const readFileMock = vi.hoisted(() => vi.fn());

vi.mock('fs/promises', () => ({
  readFile: readFileMock,
}));

describe('createContextLoader', () => {
  beforeEach(() => {
    readFileMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeLoader() {
    return createContextLoader({
      getRuntimeHome: () => Promise.resolve(HOME),
      getAgentContextInstructions: () => Promise.resolve(''),
    });
  }

  describe('loadAgentContextInstructions', () => {
    test('returns file content when file exists and is non-empty', async () => {
      readFileMock.mockResolvedValueOnce('My agent context instructions here.');
      const result = await makeLoader().loadAgentContextInstructions();
      expect(result).toBe('My agent context instructions here.');
      expect(readFileMock).toHaveBeenCalledWith(`${HOME}/AGENT_CONTEXT.md`, 'utf-8');
    });

    test('returns empty string when file is empty', async () => {
      readFileMock.mockResolvedValueOnce('');
      const result = await makeLoader().loadAgentContextInstructions();
      expect(result).toBe('');
    });

    test('returns empty string when file contains only whitespace', async () => {
      readFileMock.mockResolvedValueOnce('   \n  \n  ');
      const result = await makeLoader().loadAgentContextInstructions();
      expect(result).toBe('');
    });

    test('returns empty string when file throws (does not exist or unreadable)', async () => {
      readFileMock.mockRejectedValueOnce(new Error('ENOENT'));
      const result = await makeLoader().loadAgentContextInstructions();
      expect(result).toBe('');
    });

    test('trims leading and trailing whitespace from content', async () => {
      readFileMock.mockResolvedValueOnce('  \n  Some content  \n  ');
      const result = await makeLoader().loadAgentContextInstructions();
      expect(result).toBe('Some content');
    });

    test('adds warning decoration when content exceeds AGENT_CONTEXT_WARNING_CHAR_LIMIT', async () => {
      // Content > 8000 chars after trim() — needs leading/trailing whitespace
      // so trimmed length still exceeds the 8000 threshold.
      readFileMock.mockResolvedValueOnce('A'.repeat(8005));
      const result = await makeLoader().loadAgentContextInstructions();
      expect(result).toContain('⚠️');
      expect(result).toContain('8005 chars');
      expect(result).toContain('8000 char warning threshold');
    });

    test('does not add warning when content is exactly at the warning threshold', async () => {
      readFileMock.mockResolvedValueOnce('B'.repeat(8000));
      const result = await makeLoader().loadAgentContextInstructions();
      expect(result).toBe('B'.repeat(8000));
      expect(result).not.toContain('⚠️');
    });

    test('does not add warning when content is below the warning threshold', async () => {
      readFileMock.mockResolvedValueOnce('Short content.');
      const result = await makeLoader().loadAgentContextInstructions();
      expect(result).toBe('Short content.');
      expect(result).not.toContain('⚠️');
    });
  });

  describe('loadRuntimeContext', () => {
    test('delegates to loadAgentContextInstructions', async () => {
      readFileMock.mockResolvedValueOnce('runtime context from file');
      const result = await makeLoader().loadRuntimeContext();
      expect(result).toBe('runtime context from file');
    });
  });

  describe('buildStepSystemPrompt', () => {
    test('returns null when agentContextInstructions is empty', () => {
      expect(makeLoader().buildStepSystemPrompt({ agentContextInstructions: '' })).toBeNull();
    });

    test('returns null when agentContextInstructions is only whitespace', () => {
      expect(makeLoader().buildStepSystemPrompt({ agentContextInstructions: '   \n  ' })).toBeNull();
    });

    test('returns formatted system prompt with non-empty instructions', () => {
      const result = makeLoader().buildStepSystemPrompt({ agentContextInstructions: 'You are a helpful assistant.' });
      expect(result).toContain('You have access to the following agent context:');
      expect(result).toContain('You are a helpful assistant.');
    });
  });
});
