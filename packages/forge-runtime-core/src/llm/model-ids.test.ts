import { describe, expect, it } from 'vitest';
import {
  OPENAI_CODEX_MODELS,
  CLAUDE_MAX_MODELS,
  type OpenAICodexModelId,
  type ClaudeMaxModelId,
} from './model-ids';

describe('OPENAI_CODEX_MODELS', () => {
  it('contains four model IDs', () => {
    expect(OPENAI_CODEX_MODELS).toHaveLength(4);
  });

  it('contains expected model IDs', () => {
    expect(OPENAI_CODEX_MODELS).toContain('gpt-5.4');
    expect(OPENAI_CODEX_MODELS).toContain('gpt-5.4-nano');
    expect(OPENAI_CODEX_MODELS).toContain('gpt-5.4-mini');
    expect(OPENAI_CODEX_MODELS).toContain('gpt-5.3-codex');
  });

  it('type resolves to literal union', () => {
    const model: OpenAICodexModelId = 'gpt-5.4';
    expect(model).toBe('gpt-5.4');
  });
});

describe('CLAUDE_MAX_MODELS', () => {
  it('contains three model IDs', () => {
    expect(CLAUDE_MAX_MODELS).toHaveLength(3);
  });

  it('contains expected model IDs', () => {
    expect(CLAUDE_MAX_MODELS).toContain('claude-opus-4-6');
    expect(CLAUDE_MAX_MODELS).toContain('claude-sonnet-4-6');
    expect(CLAUDE_MAX_MODELS).toContain('claude-haiku-4-5');
  });

  it('type resolves to literal union', () => {
    const model: ClaudeMaxModelId = 'claude-sonnet-4-6';
    expect(model).toBe('claude-sonnet-4-6');
  });
});
