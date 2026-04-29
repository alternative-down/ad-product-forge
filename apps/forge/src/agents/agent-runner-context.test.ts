import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { createContextLoader } from './agent-runner-context.js';

const existsMock = vi.hoisted(() => vi.fn());
const readFileMock = vi.hoisted(() => vi.fn());

describe('createContextLoader', () => {
  beforeEach(() => {
    existsMock.mockReset();
    readFileMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeLoader() {
    return createContextLoader({
      filesystem: {
        exists: existsMock,
        readFile: readFileMock,
      },
    });
  }

  describe('loadAgentContextInstructions', () => {
    test('returns file content when file exists and is non-empty', async () => {
      existsMock.mockResolvedValueOnce(true);
      readFileMock.mockResolvedValueOnce('My agent context instructions here.');
      const result = await makeLoader().loadAgentContextInstructions();
      expect(result).toBe('My agent context instructions here.');
      expect(existsMock).toHaveBeenCalledWith('AGENT_CONTEXT.md');
      expect(readFileMock).toHaveBeenCalledWith('AGENT_CONTEXT.md');
    });

    test('returns empty string when file does not exist', async () => {
      existsMock.mockResolvedValueOnce(false);
      const result = await makeLoader().loadAgentContextInstructions();
      expect(result).toBe('');
      expect(readFileMock).not.toHaveBeenCalled();
    });

    test('returns empty string when file is empty', async () => {
      existsMock.mockResolvedValueOnce(true);
      readFileMock.mockResolvedValueOnce('');
      const result = await makeLoader().loadAgentContextInstructions();
      expect(result).toBe('');
    });

    test('returns empty string when file contains only whitespace', async () => {
      existsMock.mockResolvedValueOnce(true);
      readFileMock.mockResolvedValueOnce('   \n  \n  ');
      const result = await makeLoader().loadAgentContextInstructions();
      expect(result).toBe('');
    });

    test('returns empty string when readFile throws (unreadable)', async () => {
      existsMock.mockResolvedValueOnce(true);
      readFileMock.mockRejectedValueOnce(new Error('ENOENT'));
      const result = await makeLoader().loadAgentContextInstructions();
      expect(result).toBe('');
    });

    test('trims leading and trailing whitespace from content', async () => {
      existsMock.mockResolvedValueOnce(true);
      readFileMock.mockResolvedValueOnce('  \n  Some content  \n  ');
      const result = await makeLoader().loadAgentContextInstructions();
      expect(result).toBe('Some content');
    });

    test('adds warning decoration when content exceeds AGENT_CONTEXT_WARNING_CHAR_LIMIT', async () => {
      existsMock.mockResolvedValueOnce(true);
      readFileMock.mockResolvedValueOnce('A'.repeat(8005));
      const result = await makeLoader().loadAgentContextInstructions();
      expect(result).toContain('⚠️');
      expect(result).toContain('8005 chars');
      expect(result).toContain('8000 char warning threshold');
    });

    test('does not add warning when content is exactly at the warning threshold', async () => {
      existsMock.mockResolvedValueOnce(true);
      readFileMock.mockResolvedValueOnce('B'.repeat(8000));
      const result = await makeLoader().loadAgentContextInstructions();
      expect(result).toBe('B'.repeat(8000));
      expect(result).not.toContain('⚠️');
    });

    test('does not add warning when content is below the warning threshold', async () => {
      existsMock.mockResolvedValueOnce(true);
      readFileMock.mockResolvedValueOnce('Short content.');
      const result = await makeLoader().loadAgentContextInstructions();
      expect(result).toBe('Short content.');
      expect(result).not.toContain('⚠️');
    });

    test('handles Uint8Array content from readFile', async () => {
      existsMock.mockResolvedValueOnce(true);
      const encoder = new TextEncoder();
      readFileMock.mockResolvedValueOnce(encoder.encode('Uint8Array content'));
      const result = await makeLoader().loadAgentContextInstructions();
      expect(result).toBe('Uint8Array content');
    });
  });

  describe('loadRuntimeContext', () => {
    test('delegates to loadAgentContextInstructions', async () => {
      existsMock.mockResolvedValueOnce(true);
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
