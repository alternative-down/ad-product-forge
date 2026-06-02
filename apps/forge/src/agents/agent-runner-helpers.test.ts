import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withTimeout } from '../utils/async';
import { isNoActionNeeded, isStopAndIdle, extractControlDirective } from './agent-runner-helpers';
import {
  serializeError,
  serializeUnknown,
  formatAbsentExecutionError,
  extractAbsentErrorDetails,
  formatAbsentErrorDetailValue,
} from './error-formatting';
import {
  buildStepSystemPrompt,
  hasExactControlDirective,
  extractRunnerControlDirective,
} from './agent-runner-control-directives';
import {
  buildIterationLoopSignature,
  buildRecallStepFromIteration,
  didIterationProduceVisibleAssistantText,
  didIterationUpdateWorkingMemory,
} from './agent-runner-iteration-helpers';
import { collectStepTextParts } from './agent-runner-control-directives';
import { extractRunnerControlDirectiveFromIteration } from './agent-runner-control-directives';

describe('agent-runner-helpers', () => {
  // ── withTimeout ────────────────────────────────────────────────────────────
  describe('withTimeout', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('resolves when promise resolves before timeout', async () => {
      const promise = Promise.resolve('ok');
      const result = withTimeout(promise, 1000, 'timed out');
      vi.advanceTimersByTime(500);
      await expect(result).resolves.toBe('ok');
    });

    it('rejects when promise rejects before timeout', async () => {
      const promise = Promise.reject(new Error('boom'));
      const result = withTimeout(promise, 1000, 'timed out');
      vi.advanceTimersByTime(500);
      await expect(result).rejects.toThrow('boom');
    });

    it('rejects when timeout fires before promise resolves', async () => {
      const promise = new Promise<string>((resolve) => setTimeout(() => resolve('late'), 2000));
      const result = withTimeout(promise, 100, 'timed out');
      vi.advanceTimersByTime(100);
      await expect(result).rejects.toThrow('timed out');
    });

    it('does not reject when promise resolves after timeout fires', async () => {
      let resolve: (v: string) => void = () => {};
      const promise = new Promise<string>((r) => {
        resolve = r;
      });
      const result = withTimeout(promise, 100, 'timed out');
      vi.advanceTimersByTime(100);
      await expect(result).rejects.toThrow('timed out');
      resolve('late');
    });
  });

  // ── buildIterationLoopSignature ─────────────────────────────────────────────
  describe('buildIterationLoopSignature', () => {
    it('serializes text and toolCalls to stable JSON', () => {
      const sig = buildIterationLoopSignature({
        text: '  hello  ',
        toolCalls: [{ name: 'tool_a', args: { x: 1 } }],
      });
      const parsed = JSON.parse(sig);
      expect(parsed.text).toBe('hello');
      expect(parsed.toolCalls).toEqual([{ toolName: 'tool_a', args: { x: 1 } }]);
    });

    it('trims whitespace from text', () => {
      const sig = buildIterationLoopSignature({ text: '  trimmed  ', toolCalls: [] });
      expect(JSON.parse(sig).text).toBe('trimmed');
    });

    it('normalizes toolCall keys to toolName', () => {
      const sig = buildIterationLoopSignature({
        text: '',
        toolCalls: [{ name: 'update', args: {} }],
      });
      expect(JSON.parse(sig).toolCalls[0]).toHaveProperty('toolName', 'update');
      expect(JSON.parse(sig).toolCalls[0]).not.toHaveProperty('name');
    });

    it('handles empty toolCalls', () => {
      const sig = buildIterationLoopSignature({ text: 'empty', toolCalls: [] });
      expect(JSON.parse(sig).toolCalls).toEqual([]);
    });
  });

  // ── didIterationUpdateWorkingMemory ──────────────────────────────────────────
  describe('didIterationUpdateWorkingMemory', () => {
    it('returns true when toolCalls includes updateWorkingMemory', () => {
      expect(
        didIterationUpdateWorkingMemory({
          toolCalls: [{ name: 'readFile' }, { name: 'updateWorkingMemory' }],
        }),
      ).toBe(true);
    });

    it('returns false when no updateWorkingMemory tool', () => {
      expect(
        didIterationUpdateWorkingMemory({
          toolCalls: [{ name: 'readFile' }, { name: 'writeFile' }],
        }),
      ).toBe(false);
    });

    it('returns false for empty toolCalls', () => {
      expect(didIterationUpdateWorkingMemory({ toolCalls: [] })).toBe(false);
    });

    it('is case-sensitive', () => {
      expect(
        didIterationUpdateWorkingMemory({
          toolCalls: [{ name: 'UpdateWorkingMemory' }],
        }),
      ).toBe(false);
    });
  });

  // ── serializeError ──────────────────────────────────────────────────────────
  describe('serializeError', () => {
    it('serializes a plain Error', () => {
      const err = new Error('test message');
      const result = serializeError(err);
      expect(result).toMatchObject({ name: 'Error', message: 'test message' });
      expect(result).toHaveProperty('stack');
    });

    it('returns type/value for non-Error input', () => {
      expect(serializeError(42)).toEqual({ type: 'number', value: 42 });
      expect(serializeError('hello')).toEqual({ type: 'string', value: 'hello' });
      expect(serializeError(null)).toEqual({ type: 'object', value: null });
    });

    it('includes extra properties beyond name/message/stack', () => {
      const err = new Error('boom');
      (err as unknown as Record<string, unknown>).code = 'ERR_TEST';
      (err as unknown as Record<string, unknown>).statusCode = 500;
      const result = serializeError(err) as Record<string, unknown>;
      expect(result.code).toBe('ERR_TEST');
      expect(result.statusCode).toBe(500);
    });

    it('recursively serializes extra property values', () => {
      const err = new Error('boom');
      (err as unknown as Record<string, unknown>).meta = { nested: { value: 1 } };
      const result = serializeError(err) as Record<string, unknown>;
      expect(result.meta).toEqual({ nested: { value: 1 } });
    });
  });

  // ── serializeUnknown ────────────────────────────────────────────────────────
  describe('serializeUnknown', () => {
    it('returns primitives unchanged', () => {
      expect(serializeUnknown(42)).toBe(42);
      expect(serializeUnknown('hi')).toBe('hi');
      expect(serializeUnknown(null)).toBe(null);
      expect(serializeUnknown(undefined)).toBe(undefined);
      expect(serializeUnknown(true)).toBe(true);
    });

    it('serializes Error instances', () => {
      const err = new Error('test');
      const result = serializeUnknown(err) as Record<string, unknown>;
      expect(result.message).toBe('test');
    });

    it('serializes arrays recursively', () => {
      expect(serializeUnknown([1, [2, 3]])).toEqual([1, [2, 3]]);
    });

    it('serializes plain objects by entries', () => {
      expect(serializeUnknown({ a: 1, b: { c: 2 } })).toEqual({ a: 1, b: { c: 2 } });
    });

    it('excludes non-plain objects (Date, Map) via Object.entries returning empty', () => {
      const date = new Date('2024-01-01');
      const result = serializeUnknown(date);
      expect(result).toEqual({});
    });
  });

  // ── formatAbsentExecutionError ───────────────────────────────────────────────
  describe('formatAbsentExecutionError', () => {
    it('formats an Error with stage', () => {
      const err = new Error('something went wrong');
      const result = formatAbsentExecutionError({ stage: 'generate', error: err });
      expect(result).toContain('Stage: generate');
      expect(result).toContain('Error: something went wrong');
    });

    it('uses "unknown" when stage is null', () => {
      const result = formatAbsentExecutionError({ stage: null, error: new Error('x') });
      expect(result).toContain('Stage: unknown');
    });

    it('includes lastGenerateProgress when provided', () => {
      const err = new Error('boom');
      const result = formatAbsentExecutionError({
        stage: 'init',
        error: err,
        lastGenerateProgress: {
          stage: 'token generation',
          at: Date.parse('2024-01-01T00:00:00Z'),
          detail: { tokens: 42 },
        },
      });
      expect(result).toContain('Last progress stage: token generation');
      expect(result).toContain('Last progress detail: {"tokens":42}');
    });

    it('omits detail line when lastGenerateProgress.detail is null', () => {
      const err = new Error('boom');
      const result = formatAbsentExecutionError({
        stage: 'init',
        error: err,
        lastGenerateProgress: { stage: 'gen', at: Date.now(), detail: null },
      });
      expect(result).not.toContain('Last progress detail:');
    });

    it('stringifies non-Error error values', () => {
      const result = formatAbsentExecutionError({ stage: 'test', error: 42 });
      expect(result).toContain('Stage: test');
      expect(result).toContain('42');
    });
  });

  // ── extractAbsentErrorDetails ───────────────────────────────────────────────
  describe('extractAbsentErrorDetails', () => {
    it('extracts nothing from plain Error', () => {
      expect(extractAbsentErrorDetails(new Error('plain'))).toEqual([]);
    });

    it('extracts code', () => {
      const err = new Error('x') as Error & Record<string, unknown>;
      err.code = 'ENOTFOUND';
      expect(extractAbsentErrorDetails(err)).toContain('Error code: ENOTFOUND');
    });

    it('extracts statusCode', () => {
      const err = new Error('x') as Error & Record<string, unknown>;
      err.statusCode = 404;
      expect(extractAbsentErrorDetails(err)).toContain('statusCode: 404');
    });

    it('extracts statusText', () => {
      const err = new Error('x') as Error & Record<string, unknown>;
      err.statusText = 'Not Found';
      expect(extractAbsentErrorDetails(err)).toContain('statusText: Not Found');
    });

    it('extracts url', () => {
      const err = new Error('x') as Error & Record<string, unknown>;
      err.url = 'https://api.example.com/endpoint';
      expect(extractAbsentErrorDetails(err)).toContain('url: https://api.example.com/endpoint');
    });

    it('extracts responseBody, body, data, detail when present', () => {
      const err = new Error('x') as Error & Record<string, unknown>;
      err.responseBody = { msg: 'bad' };
      err.body = 'raw response';
      err.data = { ok: false };
      err.detail = 'extra info';
      const details = extractAbsentErrorDetails(err);
      expect(details).toContain('responseBody: {"msg":"bad"}');
      expect(details).toContain('body: raw response');
      expect(details).toContain('data: {"ok":false}');
      expect(details).toContain('Detail: extra info');
    });

    it('truncates long string values', () => {
      const err = new Error('x') as Error & Record<string, unknown>;
      err.detail = 'x'.repeat(300);
      const details = extractAbsentErrorDetails(err);
      expect(details[0]).toContain('...');
      expect(details[0].length).toBeLessThan(220);
    });
  });

  // ── formatAbsentErrorDetailValue ────────────────────────────────────────────
  describe('formatAbsentErrorDetailValue', () => {
    it('returns null for null/undefined', () => {
      expect(formatAbsentErrorDetailValue(null)).toBe(null);
      expect(formatAbsentErrorDetailValue(undefined)).toBe(null);
    });

    it('returns string values', () => {
      expect(formatAbsentErrorDetailValue('hello')).toBe('hello');
    });

    it('returns string representation of number/boolean', () => {
      expect(formatAbsentErrorDetailValue(42)).toBe('42');
      expect(formatAbsentErrorDetailValue(false)).toBe('false');
    });

    it('JSON-stringifies objects/arrays', () => {
      expect(formatAbsentErrorDetailValue({ a: 1 })).toBe('{"a":1}');
      expect(formatAbsentErrorDetailValue([1, 2])).toBe('[1,2]');
    });

    it('truncates strings over 200 chars', () => {
      const long = 'a'.repeat(300);
      const result = formatAbsentErrorDetailValue(long);
      expect(result!.length).toBe(203); // 200 + '...'
      expect(result!.endsWith('...')).toBe(true);
    });
  });

  // ── buildStepSystemPrompt ───────────────────────────────────────────────────
  describe('buildStepSystemPrompt', () => {
    it('returns null when agentContextInstructions is null', () => {
      expect(buildStepSystemPrompt({ agentContextInstructions: null })).toBe(null);
    });

    it('returns null when agentContextInstructions is undefined', () => {
      expect(buildStepSystemPrompt({ agentContextInstructions: undefined })).toBe(null);
    });

    it('returns null when agentContextInstructions is empty string', () => {
      expect(buildStepSystemPrompt({ agentContextInstructions: '' })).toBe(null);
    });

    it('returns trimmed instruction when provided', () => {
      expect(buildStepSystemPrompt({ agentContextInstructions: '  hello world  ' })).toBe(
        'hello world',
      );
    });

    it('joins multiple instructions with double newline', () => {
      expect(
        buildStepSystemPrompt({
          agentContextInstructions: 'section one\n\nsection two',
        }),
      ).toBe('section one\n\nsection two');
    });
  });

  // ── extractRunnerControlDirective ────────────────────────────────────────────
  describe('extractRunnerControlDirective', () => {
    it('returns stop when STOP_AND_IDLE appears in text', () => {
      expect(extractRunnerControlDirective({ text: 'hello STOP_AND_IDLE world' })).toBe('stop');
    });

    it('returns ignore when NO_ACTION_NEEDED appears in text', () => {
      expect(extractRunnerControlDirective({ text: 'NO_ACTION_NEEDED' })).toBe('ignore');
    });

    it('returns null when no directive present', () => {
      expect(extractRunnerControlDirective({ text: 'normal response' })).toBe(null);
    });

    it('checks steps.uiMessages[].parts[].text', () => {
      expect(
        extractRunnerControlDirective({
          text: '',
          steps: [
            { response: { uiMessages: [{ parts: [{ type: 'text', text: 'STOP_AND_IDLE' }] }] } },
          ],
        }),
      ).toBe('stop');
    });

    it('prefers stop over ignore', () => {
      expect(
        extractRunnerControlDirective({
          text: 'STOP_AND_IDLE and NO_ACTION_NEEDED',
        }),
      ).toBe('stop');
    });
  });

  // ── extractRunnerControlDirectiveFromIteration ───────────────────────────────
  describe('extractRunnerControlDirectiveFromIteration', () => {
    it('returns stop on STOP_AND_IDLE', () => {
      expect(extractRunnerControlDirectiveFromIteration({ text: 'ready to STOP_AND_IDLE' })).toBe(
        'stop',
      );
    });

    it('returns ignore on NO_ACTION_NEEDED', () => {
      expect(extractRunnerControlDirectiveFromIteration({ text: 'NO_ACTION_NEEDED' })).toBe(
        'ignore',
      );
    });

    it('returns null for plain text', () => {
      expect(extractRunnerControlDirectiveFromIteration({ text: 'hello' })).toBe(null);
    });

    it('trims before checking', () => {
      expect(extractRunnerControlDirectiveFromIteration({ text: '  NO_ACTION_NEEDED  ' })).toBe(
        'ignore',
      );
    });
  });

  // ── buildRecallStepFromIteration ───────────────────────────────────────────
  describe('buildRecallStepFromIteration', () => {
    it('maps iteration to recall step structure', () => {
      const iteration = {
        text: 'remember this',
        toolCalls: [{ name: 'tool_a', args: { x: 1 } }],
        toolResults: [{ name: 'tool_a', result: { ok: true } }],
      };
      const step = buildRecallStepFromIteration(iteration);
      expect(step.text).toBe('remember this');
      expect(step.toolCalls).toEqual([{ toolName: 'tool_a', args: { x: 1 } }]);
      expect(step.toolResults).toEqual([{ toolName: 'tool_a', result: { ok: true } }]);
    });

    it('handles empty toolCalls and toolResults', () => {
      const step = buildRecallStepFromIteration({ text: '', toolCalls: [], toolResults: [] });
      expect(step.toolCalls).toEqual([]);
      expect(step.toolResults).toEqual([]);
    });
  });

  // ── didIterationProduceVisibleAssistantText ───────────────────────────────────
  describe('didIterationProduceVisibleAssistantText', () => {
    it('returns true when iteration.text is non-empty', () => {
      expect(didIterationProduceVisibleAssistantText({ text: 'hello', messages: [] })).toBe(true);
    });

    it('returns false for empty text and empty messages', () => {
      expect(didIterationProduceVisibleAssistantText({ text: '', messages: [] })).toBe(false);
    });

    it('returns true for assistant message with string content', () => {
      expect(
        didIterationProduceVisibleAssistantText({
          text: '',
          messages: [{ role: 'assistant', content: 'hello' }],
        }),
      ).toBe(true);
    });

    it('returns false for non-assistant messages', () => {
      expect(
        didIterationProduceVisibleAssistantText({
          text: '',
          messages: [{ role: 'user', content: 'hello' }],
        }),
      ).toBe(false);
    });

    it('returns true for assistant message with parts containing text', () => {
      expect(
        didIterationProduceVisibleAssistantText({
          text: '',
          messages: [{ role: 'assistant', content: [{ type: 'text', text: 'visible' }] }],
        }),
      ).toBe(true);
    });

    it('skips parts without type=text', () => {
      expect(
        didIterationProduceVisibleAssistantText({
          text: '',
          messages: [{ role: 'assistant', content: [{ type: 'image' }] }],
        }),
      ).toBe(false);
    });

    it('skips non-object messages', () => {
      expect(
        didIterationProduceVisibleAssistantText({
          text: '',
          messages: [null, 'string', 42],
        }),
      ).toBe(false);
    });
  });

  // ── collectStepTextParts ────────────────────────────────────────────────────
  describe('collectStepTextParts', () => {
    it('collects text from uiMessages parts', () => {
      const steps = [
        {
          response: {
            uiMessages: [
              {
                parts: [
                  { type: 'text', text: 'part one' },
                  { type: 'text', text: 'part two' },
                ],
              },
            ],
          },
        },
      ];
      expect(collectStepTextParts(steps)).toEqual(['part one', 'part two']);
    });

    it('skips non-text part types', () => {
      const steps = [
        {
          response: {
            uiMessages: [
              {
                parts: [
                  { type: 'image', text: 'ignored' },
                  { type: 'text', text: 'kept' },
                ],
              },
            ],
          },
        },
      ];
      expect(collectStepTextParts(steps)).toEqual(['kept']);
    });

    it('returns empty array for empty steps', () => {
      expect(collectStepTextParts([])).toEqual([]);
    });

    it('handles missing response, uiMessages, or parts gracefully', () => {
      expect(collectStepTextParts([{}])).toEqual([]);
      expect(collectStepTextParts([{ response: {} }])).toEqual([]);
      expect(collectStepTextParts([{ response: { uiMessages: [] } }])).toEqual([]);
    });

    it('skips non-object parts', () => {
      const steps = [
        {
          response: {
            uiMessages: [
              {
                parts: [null, 'string', 42, { type: 'text', text: 'valid' }],
              },
            ],
          },
        },
      ];
      expect(collectStepTextParts(steps)).toEqual(['valid']);
    });
  });

  // ── hasExactControlDirective ────────────────────────────────────────────────
  describe('hasExactControlDirective', () => {
    it('returns true when directive appears on its own line', () => {
      expect(hasExactControlDirective('hello\nSTOP_AND_IDLE\nworld', 'STOP_AND_IDLE')).toBe(true);
    });

    it('returns true when directive is embedded in line', () => {
      expect(hasExactControlDirective('result: NO_ACTION_NEEDED', 'NO_ACTION_NEEDED')).toBe(true);
    });

    it('is case-sensitive', () => {
      expect(hasExactControlDirective('stop_and_idle', 'STOP_AND_IDLE')).toBe(false);
    });

    it('trims lines before checking', () => {
      expect(hasExactControlDirective('  NO_ACTION_NEEDED  ', 'NO_ACTION_NEEDED')).toBe(true);
    });

    it('returns false when directive not present', () => {
      expect(hasExactControlDirective('normal output', 'STOP_AND_IDLE')).toBe(false);
    });

    it('returns false for empty text', () => {
      expect(hasExactControlDirective('', 'STOP_AND_IDLE')).toBe(false);
    });
  });

  describe('isNoActionNeeded', () => {
    it('returns true for text starting with NO_ACTION_NEEDED', () => {
      const result = isNoActionNeeded('NO_ACTION_NEEDED');
      expect(result).toBe(true);
    });

    it('returns true for text with leading whitespace before NO_ACTION_NEEDED', () => {
      const result = isNoActionNeeded('  NO_ACTION_NEEDED');
      expect(result).toBe(true);
    });

    it('returns true for text with tabs before NO_ACTION_NEEDED', () => {
      const result = isNoActionNeeded('		NO_ACTION_NEEDED');
      expect(result).toBe(true);
    });

    it('returns false for text not starting with NO_ACTION_NEEDED', () => {
      expect(isNoActionNeeded('Some other text')).toBe(false);
      expect(isNoActionNeeded('')).toBe(false);
      expect(isNoActionNeeded('stop_and_idle')).toBe(false);
    });

    it('returns true for text that starts with NO_ACTION_NEEDED (including extensions)', () => {
      expect(isNoActionNeeded('NO_ACTION_NEEDED')).toBe(true);
      expect(isNoActionNeeded('NO_ACTION_NEEDED some trailing text')).toBe(true);
    });

    it('is case-sensitive', () => {
      expect(isNoActionNeeded('no_action_needed')).toBe(false);
      expect(isNoActionNeeded('No_Action_Needed')).toBe(false);
      expect(isNoActionNeeded('no action needed')).toBe(false);
    });
  });

  describe('isStopAndIdle', () => {
    it('returns true for text starting with STOP_AND_IDLE', () => {
      const result = isStopAndIdle('STOP_AND_IDLE');
      expect(result).toBe(true);
    });

    it('returns true for text with leading whitespace before STOP_AND_IDLE', () => {
      const result = isStopAndIdle('  STOP_AND_IDLE');
      expect(result).toBe(true);
    });

    it('returns true for text with tabs before STOP_AND_IDLE', () => {
      const result = isStopAndIdle('		STOP_AND_IDLE');
      expect(result).toBe(true);
    });

    it('returns false for text not starting with STOP_AND_IDLE', () => {
      expect(isStopAndIdle('Some other text')).toBe(false);
      expect(isStopAndIdle('')).toBe(false);
      expect(isStopAndIdle('no_action_needed')).toBe(false);
    });

    it('returns true for text that starts with STOP_AND_IDLE (including extensions)', () => {
      expect(isStopAndIdle('STOP_AND_IDLE')).toBe(true);
      expect(isStopAndIdle('STOP_AND_IDLE some trailing text')).toBe(true);
    });

    it('is case-sensitive', () => {
      expect(isStopAndIdle('stop_and_idle')).toBe(false);
      expect(isStopAndIdle('Stop_And_Idle')).toBe(false);
      expect(isStopAndIdle('stop and idle')).toBe(false);
    });
  });

  describe('extractControlDirective', () => {
    it('returns stop for text starting with STOP_AND_IDLE', () => {
      expect(extractControlDirective('STOP_AND_IDLE')).toBe('stop');
    });

    it('returns stop for text with leading whitespace before STOP_AND_IDLE', () => {
      expect(extractControlDirective('  STOP_AND_IDLE')).toBe('stop');
      expect(extractControlDirective('	STOP_AND_IDLE')).toBe('stop');
    });

    it('returns stop with trailing content after STOP_AND_IDLE', () => {
      expect(extractControlDirective('STOP_AND_IDLE some extra text')).toBe('stop');
    });

    it('returns no-action-needed for text starting with NO_ACTION_NEEDED', () => {
      expect(extractControlDirective('NO_ACTION_NEEDED')).toBe('no-action-needed');
    });

    it('returns no-action-needed for text with leading whitespace', () => {
      expect(extractControlDirective('  NO_ACTION_NEEDED')).toBe('no-action-needed');
      expect(extractControlDirective('	NO_ACTION_NEEDED')).toBe('no-action-needed');
    });

    it('returns no-action-needed with trailing content', () => {
      expect(extractControlDirective('NO_ACTION_NEEDED rest of text')).toBe('no-action-needed');
    });

    it('returns null for plain text without control markers', () => {
      expect(extractControlDirective('Hello world')).toBe(null);
      expect(extractControlDirective('')).toBe(null);
      expect(extractControlDirective('stop_and_idle')).toBe(null);
      expect(extractControlDirective('no_action_needed')).toBe(null);
    });

    it('is case-sensitive', () => {
      expect(extractControlDirective('stop_and_idle')).toBe(null);
      expect(extractControlDirective('no_action_needed')).toBe(null);
      expect(extractControlDirective('Stop_And_Idle')).toBe(null);
      expect(extractControlDirective('No_Action_Needed')).toBe(null);
    });

    it('prefers stop over no-action-needed when both could match', () => {
      // STOP_AND_IDLE comes first in the logic
      expect(extractControlDirective('STOP_AND_IDLE')).toBe('stop');
    });
  });
});
