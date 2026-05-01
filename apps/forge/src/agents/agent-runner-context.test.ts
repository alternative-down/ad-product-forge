import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createContextLoader } from './agent-runner-context';

describe('createContextLoader', () => {
  let filesystem: ReturnType<ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    filesystem = {
      exists: vi.fn(),
      readFile: vi.fn(),
    };
  });

  describe('loadAgentContextInstructions', () => {
    it('returns empty string when file does not exist', async () => {
      filesystem.exists.mockResolvedValue(false);

      const loader = createContextLoader({ filesystem: filesystem as never });
      const result = await loader.loadAgentContextInstructions();

      expect(result).toBe('');
    });

    it('returns empty string when file is empty', async () => {
      filesystem.exists.mockResolvedValue(true);
      filesystem.readFile.mockResolvedValue('');

      const loader = createContextLoader({ filesystem: filesystem as never });
      const result = await loader.loadAgentContextInstructions();

      expect(result).toBe('');
    });

    it('returns trimmed content when file exists', async () => {
      filesystem.exists.mockResolvedValue(true);
      filesystem.readFile.mockResolvedValue('  some context  ');

      const loader = createContextLoader({ filesystem: filesystem as never });
      const result = await loader.loadAgentContextInstructions();

      expect(result).toBe('some context');
    });

    it('returns trimmed content for Buffer', async () => {
      filesystem.exists.mockResolvedValue(true);
      filesystem.readFile.mockResolvedValue(Buffer.from('  buffer context  '));

      const loader = createContextLoader({ filesystem: filesystem as never });
      const result = await loader.loadAgentContextInstructions();

      expect(result).toBe('buffer context');
    });

    it('returns trimmed content for Uint8Array', async () => {
      filesystem.exists.mockResolvedValue(true);
      const text = '  uint8 context  ';
      const encoder = new TextEncoder();
      filesystem.readFile.mockResolvedValue(encoder.encode(text));

      const loader = createContextLoader({ filesystem: filesystem as never });
      const result = await loader.loadAgentContextInstructions();

      expect(result).toBe('uint8 context');
    });

    it('returns content with warning when exceeding 8k char limit', async () => {
      filesystem.exists.mockResolvedValue(true);
      const longContent = 'x'.repeat(10_000);
      filesystem.readFile.mockResolvedValue(longContent);

      const loader = createContextLoader({ filesystem: filesystem as never });
      const result = await loader.loadAgentContextInstructions();

      expect(result).toContain(`Context file is ${longContent.length} chars`);
      expect(result).toContain('8000 char warning threshold');
    });

    it('returns raw trimmed content when under 8k limit', async () => {
      filesystem.exists.mockResolvedValue(true);
      const content = 'x'.repeat(7_000);
      filesystem.readFile.mockResolvedValue(content);

      const loader = createContextLoader({ filesystem: filesystem as never });
      const result = await loader.loadAgentContextInstructions();

      expect(result).toBe(content);
      expect(result).not.toContain('⚠️');
    });

    it('returns empty string on read error', async () => {
      filesystem.exists.mockResolvedValue(true);
      filesystem.readFile.mockRejectedValue(new Error('read error'));

      const loader = createContextLoader({ filesystem: filesystem as never });
      const result = await loader.loadAgentContextInstructions();

      expect(result).toBe('');
    });
  });

  describe('loadRuntimeContext', () => {
    it('delegates to loadAgentContextInstructions', async () => {
      filesystem.exists.mockResolvedValue(true);
      filesystem.readFile.mockResolvedValue('runtime content');

      const loader = createContextLoader({ filesystem: filesystem as never });
      const result = await loader.loadRuntimeContext();

      expect(result).toBe('runtime content');
    });
  });

  describe('buildStepSystemPrompt', () => {
    it('returns null when agentContextInstructions is empty', () => {
      const loader = createContextLoader({ filesystem: filesystem as never });
      const result = loader.buildStepSystemPrompt({ agentContextInstructions: '' });

      expect(result).toBeNull();
    });

    it('returns null when agentContextInstructions is whitespace only', () => {
      const loader = createContextLoader({ filesystem: filesystem as never });
      const result = loader.buildStepSystemPrompt({ agentContextInstructions: '   ' });

      expect(result).toBeNull();
    });

    it('returns formatted prompt when instructions are present', () => {
      const loader = createContextLoader({ filesystem: filesystem as never });
      const result = loader.buildStepSystemPrompt({ agentContextInstructions: 'my instructions' });

      expect(result).toContain('You have access to the following agent context:');
      expect(result).toContain('my instructions');
    });
  });
});