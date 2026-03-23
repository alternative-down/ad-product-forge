export const OPENAI_CODEX_MODELS = [
  'gpt-5.4',
  'gpt-5.4-nano',
  'gpt-5.4-mini',
  'gpt-5.3-codex',
] as const;

export type OpenAICodexModelId = (typeof OPENAI_CODEX_MODELS)[number];

export const CLAUDE_MAX_MODELS = [
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-haiku-4-5',
] as const;

export type ClaudeMaxModelId = (typeof CLAUDE_MAX_MODELS)[number];

export const MINIMAX_MODELS = [
  'MiniMax-M2.5',
] as const;

export type MiniMaxModelId = (typeof MINIMAX_MODELS)[number];
