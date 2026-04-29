import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { createContextLoader } from './agent-runner-context.js';

const HOME = '/agent/workspace';
const PREAMBLE = [
  'Automatically loaded workspace context file.',
  'File: AGENT_CONTEXT.md',
  'This file should be treated as additional runtime instructions and context.',
  'This is the only workspace file auto-loaded into the execution context.',
  'Treat it as a concise summary layer. Keep details in other files and store only high-signal references here when needed.',
  'If you mention or use information from this file, do not say it came from context, instructions, notes, or memory. Use active language such as "I remember that...", "we already saw that...", or "on day X in the morning I did X" when appropriate.',
  '',
].join('\n');

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
    });
  }

  describe('loadAgentContextInstructions', () => {
    test('returns preamble-prefixed content when file exists and is non-empty', async () => {
      readFileMock.mockResolvedValueOnce('My agent context instructions here.');
      const result = await makeLoader().loadAgentContextInstructions();
      expect(result).toBe([PREAMBLE, 'My agent context instructions here.'].join('\n'));
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
      expect(result).toBe([PREAMBLE, 'Some content'].join('\n'));
    });

    test('adds warning decoration when content exceeds AGENT_CONTEXT_WARNING_CHAR_LIMIT', async () => {
      // Content 7422 chars after trim() — exceeds the 7417-char threshold
      // (threshold = 8000 - preamble_length(583) = 7417; exceeds = > 7417)
      readFileMock.mockResolvedValueOnce('A'.repeat(7422));
      const result = await makeLoader().loadAgentContextInstructions();
      expect(result).toContain('Context pressure warning:');
      expect(result).toContain('7422 chars');
    });

    test('does not add warning when content is exactly at the warning threshold', async () => {
      // Content 7417 chars — equals threshold, so > threshold is false → no warning
      readFileMock.mockResolvedValueOnce('B'.repeat(7417));
      const result = await makeLoader().loadAgentContextInstructions();
      // Result is preamble + content (no warning)
      expect(result).toBe([PREAMBLE, 'B'.repeat(7417)].join('\n'));
      expect(result).not.toContain('Context pressure warning:');
    });

    test('does not add warning when content is below the warning threshold', async () => {
      readFileMock.mockResolvedValueOnce('Short content.');
      const result = await makeLoader().loadAgentContextInstructions();
      expect(result).toBe([PREAMBLE, 'Short content.'].join('\n'));
      expect(result).not.toContain('Context pressure warning:');
    });
  });

  describe('loadRuntimeContext', () => {
    test('delegates to loadAgentContextInstructions', async () => {
      readFileMock.mockResolvedValueOnce('runtime context from file');
      const result = await makeLoader().loadRuntimeContext();
      expect(result).toBe([PREAMBLE, 'runtime context from file'].join('\n'));
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
