import { describe, expect, it } from 'vitest';
import { createMemoryAgentInstructions, getUsageFromGenerateResult, LtmUsage, LtmSnapshot } from './agent-ltm-generate-helpers';

describe('agent-ltm-generate-helpers', () => {
  describe('createMemoryAgentInstructions', () => {
    it('includes agent name in opening sentence', () => {
      const result = createMemoryAgentInstructions({
        agentId: 'test-id',
        agentName: 'TestAgent',
        agentDescription: undefined,
        roleName: undefined,
        roleDescription: undefined,
        instructions: 'Do the thing.',
      });
      expect(result).toContain('TestAgent');
      expect(result).toContain('long-term memory maintenance agent');
    });

    it('includes agent description when provided', () => {
      const result = createMemoryAgentInstructions({
        agentId: 'test-id',
        agentName: 'TestAgent',
        agentDescription: 'A helpful test agent',
        roleName: undefined,
        roleDescription: undefined,
        instructions: 'Do the thing.',
      });
      expect(result).toContain('A helpful test agent');
    });

    it('includes role name and description when provided', () => {
      const result = createMemoryAgentInstructions({
        agentId: 'test-id',
        agentName: 'TestAgent',
        agentDescription: undefined,
        roleName: 'Tester',
        roleDescription: 'Runs tests on the codebase',
        instructions: 'Do the thing.',
      });
      expect(result).toContain('Tester');
      expect(result).toContain('Runs tests on the codebase');
    });

    it('includes assigned instructions in output', () => {
      const result = createMemoryAgentInstructions({
        agentId: 'test-id',
        agentName: 'TestAgent',
        instructions: 'Remember to check for edge cases.',
      });
      expect(result).toContain('Remember to check for edge cases.');
    });

    it('filters falsy optional fields', () => {
      const result = createMemoryAgentInstructions({
        agentId: 'test-id',
        agentName: 'TestAgent',
        agentDescription: '',
        roleName: '',
        roleDescription: '',
        instructions: 'Do the thing.',
      });
      expect(result).not.toContain('- Agent description:');
      expect(result).not.toContain('- Role name:');
    });

    it('returns a non-empty string', () => {
      const result = createMemoryAgentInstructions({
        agentId: 'id',
        agentName: 'Name',
        instructions: 'test',
      });
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('getUsageFromGenerateResult', () => {
    it('returns zero usage when result.usage is undefined', () => {
      const result = getUsageFromGenerateResult({});
      expect(result).toEqual({ inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 });
    });

    it('returns zero usage when result.usage is null', () => {
      const result = getUsageFromGenerateResult({ usage: null });
      expect(result).toEqual({ inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 });
    });

    it('extracts OpenAI-style input_tokens and output_tokens', () => {
      const result = getUsageFromGenerateResult({
        usage: { input_tokens: 100, output_tokens: 200 },
      } as { usage?: { input_tokens: number; output_tokens: number } });
      expect(result.inputTokens).toBe(100);
      expect(result.outputTokens).toBe(200);
      expect(result.cachedInputTokens).toBe(0);
    });

    it('extracts Anthropic-style cached_tokens', () => {
      const result = getUsageFromGenerateResult({
        usage: { input_tokens: 100, output_tokens: 50, cached_tokens: 80 },
      } as { usage?: { input_tokens: number; output_tokens: number; cached_tokens: number } });
      expect(result.inputTokens).toBe(100);
      expect(result.outputTokens).toBe(50);
      expect(result.cachedInputTokens).toBe(80);
    });

    it('falls back to prompt_tokens / completion_tokens (older format)', () => {
      const result = getUsageFromGenerateResult({
        usage: { prompt_tokens: 50, completion_tokens: 75 },
      } as { usage?: { prompt_tokens: number; completion_tokens: number } });
      expect(result.inputTokens).toBe(50);
      expect(result.outputTokens).toBe(75);
    });

    it('handles empty usage object gracefully', () => {
      const result = getUsageFromGenerateResult({ usage: {} });
      expect(result).toEqual({ inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 });
    });
  });
});