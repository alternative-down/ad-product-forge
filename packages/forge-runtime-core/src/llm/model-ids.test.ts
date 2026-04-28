import { describe, expect, it } from 'vitest';
import { OPENAI_CODEX_MODELS, CLAUDE_MAX_MODELS } from './model-ids.js';
import type { OpenAICodexModelId, ClaudeMaxModelId } from './model-ids.js';

describe('model-ids', () => {
  describe('OPENAI_CODEX_MODELS', () => {
    it('contains 4 model identifiers', () => {
      expect(OPENAI_CODEX_MODELS).toHaveLength(4);
    });

    it('contains expected model strings', () => {
      expect(OPENAI_CODEX_MODELS).toContain('gpt-5.4');
      expect(OPENAI_CODEX_MODELS).toContain('gpt-5.4-nano');
      expect(OPENAI_CODEX_MODELS).toContain('gpt-5.4-mini');
      expect(OPENAI_CODEX_MODELS).toContain('gpt-5.3-codex');
    });

    it('is a readonly tuple', () => {
      expect(OPENAI_CODEX_MODELS[0]).toBe('gpt-5.4');
      expect(OPENAI_CODEX_MODELS[1]).toBe('gpt-5.4-nano');
      expect(OPENAI_CODEX_MODELS[2]).toBe('gpt-5.4-mini');
      expect(OPENAI_CODEX_MODELS[3]).toBe('gpt-5.3-codex');
    });

    it('type resolves to union of literal strings', () => {
      const model: OpenAICodexModelId = 'gpt-5.4';
      expect(model).toBe('gpt-5.4');
    });
  });

  describe('CLAUDE_MAX_MODELS', () => {
    it('contains 3 model identifiers', () => {
      expect(CLAUDE_MAX_MODELS).toHaveLength(3);
    });

    it('contains expected model strings', () => {
      expect(CLAUDE_MAX_MODELS).toContain('claude-opus-4-6');
      expect(CLAUDE_MAX_MODELS).toContain('claude-sonnet-4-6');
      expect(CLAUDE_MAX_MODELS).toContain('claude-haiku-4-5');
    });

    it('is a readonly tuple', () => {
      expect(CLAUDE_MAX_MODELS[0]).toBe('claude-opus-4-6');
      expect(CLAUDE_MAX_MODELS[1]).toBe('claude-sonnet-4-6');
      expect(CLAUDE_MAX_MODELS[2]).toBe('claude-haiku-4-5');
    });

    it('type resolves to union of literal strings', () => {
      const model: ClaudeMaxModelId = 'claude-opus-4-6';
      expect(model).toBe('claude-opus-4-6');
    });
  });
});
