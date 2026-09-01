/**
 * Unit tests for agent-runner-control-directives.ts.
 *
 * Groups:
 *   hasExactControlDirective — line-level directive detection
 *   collectStepTextParts — collect text from step uiMessages
 *   extractRunnerControlDirective — full result-level directive detection
 *   buildStepSystemPrompt — system prompt assembly
 */
import { describe, expect, it } from 'vitest';
import {
  hasExactControlDirective,
  collectStepTextParts,
  extractRunnerControlDirective,
  buildStepSystemPrompt,
} from './agent-runner-control-directives';

// ─── hasExactControlDirective ────────────────────────────────────────────────

describe('hasExactControlDirective', () => {
  it('returns true when directive appears at start of line', () => {
    expect(hasExactControlDirective('STOP_AND_IDLE', 'STOP_AND_IDLE')).toBe(true);
  });

  it('returns true when directive appears mid-line with whitespace', () => {
    expect(hasExactControlDirective('some text STOP_AND_IDLE here', 'STOP_AND_IDLE')).toBe(true);
  });

  it('returns true when directive appears after newlines', () => {
    const text = 'first line\n  STOP_AND_IDLE\n  third line';
    expect(hasExactControlDirective(text, 'STOP_AND_IDLE')).toBe(true);
  });

  it('returns false when directive is not present', () => {
    expect(hasExactControlDirective('normal response text', 'STOP_AND_IDLE')).toBe(false);
  });

  it('is case-sensitive', () => {
    expect(hasExactControlDirective('stop_and_idle', 'STOP_AND_IDLE')).toBe(false);
  });

  it('ignores leading whitespace', () => {
    expect(hasExactControlDirective('   STOP_AND_IDLE', 'STOP_AND_IDLE')).toBe(true);
  });

  it('returns false for empty string', () => {
    expect(hasExactControlDirective('', 'STOP_AND_IDLE')).toBe(false);
  });

  it('matches NO_ACTION_NEEDED prefix', () => {
    expect(hasExactControlDirective('NO_ACTION_NEEDED', 'NO_ACTION_NEEDED')).toBe(true);
  });
});

// ─── collectStepTextParts ───────────────────────────────────────────────────

describe('collectStepTextParts', () => {
  it('returns empty array for empty steps', () => {
    expect(collectStepTextParts([])).toEqual([]);
  });

  it('extracts text from text parts', () => {
    const steps = [
      {
        response: {
          uiMessages: [
            {
              parts: [{ type: 'text', text: 'Hello world' }],
            },
          ],
        },
      },
    ];
    expect(collectStepTextParts(steps)).toEqual(['Hello world']);
  });

  it('extracts multiple text parts from multiple messages', () => {
    const steps = [
      {
        response: {
          uiMessages: [
            {
              parts: [
                { type: 'text', text: 'First step text' },
                { type: 'text', text: 'Second part' },
              ],
            },
          ],
        },
      },
    ];
    expect(collectStepTextParts(steps)).toEqual(['First step text', 'Second part']);
  });

  it('ignores non-text parts', () => {
    const steps = [
      {
        response: {
          uiMessages: [
            {
              parts: [{ type: 'tool_call', name: 'search' }],
            },
          ],
        },
      },
    ];
    expect(collectStepTextParts(steps)).toEqual([]);
  });

  it('ignores parts with non-string text', () => {
    const steps = [
      {
        response: {
          uiMessages: [
            {
              parts: [{ type: 'text', text: 123 as unknown as string }],
            },
          ],
        },
      },
    ];
    expect(collectStepTextParts(steps)).toEqual([]);
  });

  it('skips missing response, uiMessages, or parts', () => {
    const steps = [{}];
    expect(collectStepTextParts(steps)).toEqual([]);
  });

  it('skips null/undefined parts', () => {
    const steps = [
      {
        response: {
          uiMessages: [
            {
              parts: [null, undefined, { type: 'text', text: 'valid' }],
            },
          ],
        },
      },
    ];
    expect(collectStepTextParts(steps)).toEqual(['valid']);
  });
});

// ─── extractRunnerControlDirective ───────────────────────────────────────────

describe('extractRunnerControlDirective', () => {
  it('returns stop when STOP_AND_IDLE is in result text', () => {
    expect(extractRunnerControlDirective({ text: 'STOP_AND_IDLE' })).toBe('stop');
  });

  it('returns stop when STOP_AND_IDLE is in step uiMessages', () => {
    const result = {
      text: '',
      steps: [
        {
          response: {
            uiMessages: [
              {
                parts: [{ type: 'text', text: 'STOP_AND_IDLE' }],
              },
            ],
          },
        },
      ],
    };
    expect(extractRunnerControlDirective(result)).toBe('stop');
  });

  it('returns ignore when NO_ACTION_NEEDED is in result text', () => {
    expect(extractRunnerControlDirective({ text: 'NO_ACTION_NEEDED' })).toBe('ignore');
  });

  it('returns ignore when NO_ACTION_NEEDED is in step uiMessages', () => {
    const result = {
      text: 'some output',
      steps: [
        {
          response: {
            uiMessages: [
              {
                parts: [{ type: 'text', text: 'NO_ACTION_NEEDED' }],
              },
            ],
          },
        },
      ],
    };
    expect(extractRunnerControlDirective(result)).toBe('ignore');
  });

  it('returns null for ordinary text', () => {
    expect(extractRunnerControlDirective({ text: 'Hello, how can I help you today?' })).toBe(null);
  });

  it('returns stop takes priority over ignore when both appear', () => {
    // extractRunnerControlDirective checks stop first
    expect(extractRunnerControlDirective({ text: 'STOP_AND_IDLE\nNO_ACTION_NEEDED' })).toBe('stop');
  });

  it('trims text before checking', () => {
    expect(extractRunnerControlDirective({ text: '  STOP_AND_IDLE  ' })).toBe('stop');
  });

  it('ignores empty text', () => {
    expect(extractRunnerControlDirective({ text: '' })).toBe(null);
  });

  it('handles result with no steps', () => {
    expect(extractRunnerControlDirective({ text: 'normal response' })).toBe(null);
  });
});

// ─── buildStepSystemPrompt ──────────────────────────────────────────────────

describe('buildStepSystemPrompt', () => {
  it('returns null when no instructions provided', () => {
    expect(buildStepSystemPrompt({ agentContextInstructions: null })).toBeNull();
  });

  it('returns null for undefined instructions', () => {
    expect(buildStepSystemPrompt({ agentContextInstructions: undefined })).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(buildStepSystemPrompt({ agentContextInstructions: '' })).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(buildStepSystemPrompt({ agentContextInstructions: '   \n\t' })).toBeNull();
  });

  it('returns trimmed instructions as-is', () => {
    const result = buildStepSystemPrompt({
      agentContextInstructions: '  You are a helpful assistant.  ',
    });
    expect(result).toBe('You are a helpful assistant.');
  });

  it('returns the exact string for non-empty instructions', () => {
    const instructions = 'You are Acme assistant.';
    expect(buildStepSystemPrompt({ agentContextInstructions: instructions })).toBe(instructions);
  });
});
