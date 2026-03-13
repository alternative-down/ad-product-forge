export const OPENAI_CODEX_MODELS = [
  'gpt-5.4',
  'gpt-5.3-codex',
  'gpt-5.2',
  'gpt-5.2-codex',
  'gpt-5.1',
  'gpt-5.1-codex-max',
  'gpt-5.1-codex',
  'gpt-5.1-codex-mini',
  'gpt-5-codex',
  'gpt-5-codex-mini',
] as const;

export type OpenAICodexModelId = (typeof OPENAI_CODEX_MODELS)[number];

export const CLAUDE_MAX_MODELS = [
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-haiku-4-5',
  'claude-opus-4-1',
  'claude-opus-4-0',
  'claude-sonnet-4-0',
  'claude-3-7-sonnet-latest',
  'claude-3-5-haiku-latest',
  'claude-3-5-sonnet-latest',
] as const;

export type ClaudeMaxModelId = (typeof CLAUDE_MAX_MODELS)[number];
