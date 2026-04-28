import { describe, expect, it } from 'vitest';
import { CLAUDE_MAX_MODELS, OPENAI_CODEX_MODELS } from './model-ids.js';
import type { ClaudeMaxModelId, OpenAICodexModelId } from './model-ids.js';

describe('model-ids', () => {
  describe('CLAUDE_MAX_MODELS', () => {
    it('is a readonly tuple', () => {
      expect(Array.isArray(CLAUDE_MAX_MODELS)).toBe(true);
      expect(CLAUDE_MAX_MODELS.length).toBeGreaterThan(0);
    });

    it('contains non-empty string entries', () => {
      for (const model of CLAUDE_MAX_MODELS) {
        expect(typeof model).toBe('string');
        expect(model.length).toBeGreaterThan(0);
      }
    });

    it('first entry is a string', () => {
      expect(typeof CLAUDE_MAX_MODELS[0]).toBe('string');
    });
  });

  describe('OPENAI_CODEX_MODELS', () => {
    it('is a readonly tuple', () => {
      expect(Array.isArray(OPENAI_CODEX_MODELS)).toBe(true);
      expect(OPENAI_CODEX_MODELS.length).toBeGreaterThan(0);
    });

    it('contains non-empty string entries', () => {
      for (const model of OPENAI_CODEX_MODELS) {
        expect(typeof model).toBe('string');
        expect(model.length).toBeGreaterThan(0);
      }
    });

    it('is distinct from CLAUDE_MAX_MODELS', () => {
      expect(OPENAI_CODEX_MODELS).not.toEqual(CLAUDE_MAX_MODELS);
    });
  });

  describe('ClaudeMaxModelId type', () => {
    it('is assignable from CLAUDE_MAX_MODELS entry', () => {
      const id: ClaudeMaxModelId = CLAUDE_MAX_MODELS[0];
      expect(typeof id).toBe('string');
    });

    it('accepts known model strings', () => {
      const ids: ClaudeMaxModelId[] = CLAUDE_MAX_MODELS;
      expect(ids.length).toBeGreaterThan(0);
    });
  });

  describe('OpenAICodexModelId type', () => {
    it('is assignable from OPENAI_CODEX_MODELS entry', () => {
      const id: OpenAICodexModelId = OPENAI_CODEX_MODELS[0];
      expect(typeof id).toBe('string');
    });

    it('accepts known model strings', () => {
      const ids: OpenAICodexModelId[] = OPENAI_CODEX_MODELS;
      expect(ids.length).toBeGreaterThan(0);
    });
  });
});
