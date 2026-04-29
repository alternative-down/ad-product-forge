import { describe, expect, test, vi, beforeEach } from 'vitest';
import {
  delay,
  withTimeout,
  buildIterationLoopSignature,
  didIterationUpdateWorkingMemory,
  serializeError,
  serializeUnknown,
  formatAbsentExecutionError,
  extractAbsentErrorDetails,
  formatAbsentErrorDetailValue,
  buildStepSystemPrompt,
  extractRunnerControlDirective,
  extractRunnerControlDirectiveFromIteration,
  buildRecallStepFromIteration,
  didIterationProduceVisibleAssistantText,
  collectStepTextParts,
  hasExactControlDirective,
} from './agent-runner-helpers.js';

describe('delay', () => {
  test('resolves after the specified milliseconds', async () => {
    const start = Date.now();
    await delay(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(45);
    expect(elapsed).toBeLessThan(200);
  });

  test('resolves immediately for 0ms', async () => {
    const start = Date.now();
    await delay(0);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(20);
  });
});

describe('withTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  test('resolves when promise resolves before timeout', async () => {
    const promise = new Promise<string>((resolve) => {
      setTimeout(() => resolve('done'), 50);
    });
    const resultPromise = withTimeout(promise, 200, 'timed out');
    vi.advanceTimersByTime(60);
    const result = await resultPromise;
    expect(result).toBe('done');
  });

  test('rejects when timeout fires before promise resolves', async () => {
    const promise = new Promise<string>((resolve) => {
      setTimeout(() => resolve('done'), 200);
    });
    const resultPromise = withTimeout(promise, 50, 'timed out');
    vi.advanceTimersByTime(60);
    await expect(resultPromise).rejects.toThrow('timed out');
  });

  test('rejects with custom message', async () => {
    const promise = new Promise<string>((resolve) => {
      setTimeout(() => resolve('done'), 200);
    });
    const resultPromise = withTimeout(promise, 50, 'custom timeout message');
    vi.advanceTimersByTime(60);
    await expect(resultPromise).rejects.toThrow('custom timeout message');
  });

  test('clears timeout when promise resolves first', async () => {
    const promise = new Promise<string>((resolve) => {
      setTimeout(() => resolve('done'), 10);
    });
    const resultPromise = withTimeout(promise, 200, 'timed out');
    vi.advanceTimersByTime(15);
    await expect(resultPromise).resolves.toBe('done');
  });

  test('works with a value that resolves synchronously', async () => {
    const promise = Promise.resolve('sync');
    const result = await withTimeout(promise, 100, 'timeout');
    expect(result).toBe('sync');
  });

  test('propagates promise rejection before timeout', async () => {
    const promise = Promise.reject(new Error('inner error'));
    await expect(withTimeout(promise, 200, 'timeout')).rejects.toThrow('inner error');
  });
});

describe('buildIterationLoopSignature', () => {
  test('serializes text and tool calls to JSON', () => {
    const sig = buildIterationLoopSignature({
      text: '  hello world  ',
      toolCalls: [{ name: 'send_message', args: { content: 'hi' } }],
    });
    const parsed = JSON.parse(sig);
    expect(parsed.text).toBe('hello world');
    expect(parsed.toolCalls).toHaveLength(1);
    expect(parsed.toolCalls[0].toolName).toBe('send_message');
    expect(parsed.toolCalls[0].args).toEqual({ content: 'hi' });
  });

  test('trims whitespace from text', () => {
    const sig = buildIterationLoopSignature({
      text: '  \n  trimmed  \n',
      toolCalls: [],
    });
    const parsed = JSON.parse(sig);
    expect(parsed.text).toBe('trimmed');
  });

  test('handles multiple tool calls', () => {
    const sig = buildIterationLoopSignature({
      text: 'test',
      toolCalls: [
        { name: 'toolA', args: { a: 1 } },
        { name: 'toolB', args: { b: 2 } },
        { name: 'toolC', args: {} },
      ],
    });
    const parsed = JSON.parse(sig);
    expect(parsed.toolCalls).toHaveLength(3);
  });

  test('identical inputs produce identical signatures', () => {
    const iter = { text: '  hello  ', toolCalls: [{ name: 'send_message', args: { content: 'hi' } }] };
    expect(buildIterationLoopSignature(iter)).toBe(buildIterationLoopSignature(iter));
  });

  test('different inputs produce different signatures', () => {
    const iter1 = { text: 'hello', toolCalls: [] };
    const iter2 = { text: 'world', toolCalls: [] };
    expect(buildIterationLoopSignature(iter1)).not.toBe(buildIterationLoopSignature(iter2));
  });
});

describe('didIterationUpdateWorkingMemory', () => {
  test('returns true when toolCalls includes updateWorkingMemory', () => {
    const iter = {
      toolCalls: [{ name: 'send_message', args: {} }, { name: 'updateWorkingMemory', args: {} }],
    };
    expect(didIterationUpdateWorkingMemory(iter)).toBe(true);
  });

  test('returns true when updateWorkingMemory is the only tool', () => {
    const iter = { toolCalls: [{ name: 'updateWorkingMemory', args: {} }] };
    expect(didIterationUpdateWorkingMemory(iter)).toBe(true);
  });

  test('returns false when no updateWorkingMemory tool', () => {
    const iter = { toolCalls: [{ name: 'send_message', args: {} }] };
    expect(didIterationUpdateWorkingMemory(iter)).toBe(false);
  });

  test('returns false when toolCalls is empty', () => {
    expect(didIterationUpdateWorkingMemory({ toolCalls: [] })).toBe(false);
  });
});

describe('serializeError', () => {
  test('serializes Error with name, message, stack', () => {
    const error = new Error('something went wrong');
    const result = serializeError(error);
    expect(result.name).toBe('Error');
    expect(result.message).toBe('something went wrong');
    expect(result.stack).toBe(error.stack);
  });

  test('serializes Error subclasses', () => {
    class CustomError extends Error {
      code = 'CUSTOM';
      constructor() { super('custom error'); this.name = 'CustomError'; }
    }
    const result = serializeError(new CustomError());
    expect(result.name).toBe('CustomError');
    expect(result.message).toBe('custom error');
    expect((result as Record<string, unknown>).code).toBe('CUSTOM');
  });

  test('serializes non-Error values', () => {
    expect(serializeError('not an error')).toEqual({ type: 'string', value: 'not an error' });
    expect(serializeError(42)).toEqual({ type: 'number', value: 42 });
    expect(serializeError(null)).toEqual({ type: 'object', value: null });
  });

  test('recursively serializes nested objects in Error properties', () => {
    const error = new Error('nested');
    (error as unknown as Record<string, unknown>).details = { inner: new Error('inner error'), plain: 'value' };
    const result = serializeError(error) as Record<string, unknown>;
    const details = result.details as Record<string, unknown>;
    expect(details.plain).toBe('value');
    const inner = details.inner as Record<string, unknown>;
    expect(inner.name).toBe('Error');
    expect(inner.message).toBe('inner error');
  });

  test('serializes arrays recursively', () => {
    const error = new Error('arr');
    (error as unknown as Record<string, unknown>).items = [1, new Error('inner error'), 'three'];
    const result = serializeError(error) as Record<string, unknown>;
    const items = result.items as unknown[];
    expect(items[0]).toBe(1);
    expect((items[1] as Record<string, unknown>).message).toBe('inner error');
    expect(items[2]).toBe('three');
  });
});

describe('serializeUnknown', () => {
  test('serializes plain objects', () => {
    expect(serializeUnknown({ a: 1, b: 'two' })).toEqual({ a: 1, b: 'two' });
  });

  test('serializes nested objects', () => {
    expect(serializeUnknown({ nested: { deep: true } })).toEqual({ nested: { deep: true } });
  });

  test('serializes Error as object with name/message/stack', () => {
    const error = new Error('test error');
    const result = serializeUnknown(error) as Record<string, unknown>;
    expect(result.name).toBe('Error');
    expect(result.message).toBe('test error');
  });

  test('serializes arrays', () => {
    expect(serializeUnknown([1, 2, 3])).toEqual([1, 2, 3]);
  });

  test('serializes arrays containing errors', () => {
    const result = serializeUnknown([new Error('arr err')]) as unknown[];
    expect((result[0] as Record<string, unknown>).message).toBe('arr err');
  });

  test('returns primitives unchanged', () => {
    expect(serializeUnknown('string')).toBe('string');
    expect(serializeUnknown(123)).toBe(123);
    expect(serializeUnknown(true)).toBe(true);
    expect(serializeUnknown(null)).toBe(null);
    expect(serializeUnknown(undefined)).toBe(undefined);
  });
});

describe('extractAbsentErrorDetails', () => {
  test('returns empty array for Error without recognized fields', () => {
    expect(extractAbsentErrorDetails(new Error('plain'))).toEqual([]);
  });

  test('extracts statusCode', () => {
    const error = new Error('http error') as Error & { statusCode: number };
    error.statusCode = 404;
    expect(extractAbsentErrorDetails(error)).toContain('statusCode: 404');
  });

  test('extracts statusText', () => {
    const error = new Error('http') as Error & { statusText: string };
    error.statusText = 'Not Found';
    expect(extractAbsentErrorDetails(error)).toContain('statusText: Not Found');
  });

  test('extracts url', () => {
    const error = new Error('fetch') as Error & { url: string };
    error.url = 'https://api.example.com/endpoint';
    expect(extractAbsentErrorDetails(error)).toContain('url: https://api.example.com/endpoint');
  });

  test('extracts responseBody', () => {
    const error = new Error('response') as Error & { responseBody: string };
    error.responseBody = '{"error":"invalid"}';
    expect(extractAbsentErrorDetails(error)).toContain('responseBody: {"error":"invalid"}');
  });

  test('extracts body', () => {
    const error = new Error('body') as Error & { body: string };
    error.body = 'server error';
    expect(extractAbsentErrorDetails(error)).toContain('body: server error');
  });

  test('extracts data', () => {
    const error = new Error('data') as Error & { data: string };
    error.data = 'some data';
    expect(extractAbsentErrorDetails(error)).toContain('data: some data');
  });
});

describe('formatAbsentErrorDetailValue', () => {
  test('returns null for null', () => { expect(formatAbsentErrorDetailValue(null)).toBeNull(); });
  test('returns null for undefined', () => { expect(formatAbsentErrorDetailValue(undefined)).toBeNull(); });
  test('returns truncated string for long strings', () => {
    const long = 'a'.repeat(300);
    const result = formatAbsentErrorDetailValue(long) as string;
    expect(result).toBe('a'.repeat(200) + '...');
    expect(result).toHaveLength(203);
  });
  test('returns string for short strings', () => { expect(formatAbsentErrorDetailValue('short')).toBe('short'); });
  test('returns string for numbers', () => {
    expect(formatAbsentErrorDetailValue(42)).toBe('42');
    expect(formatAbsentErrorDetailValue(0)).toBe('0');
  });
  test('returns string for booleans', () => {
    expect(formatAbsentErrorDetailValue(true)).toBe('true');
    expect(formatAbsentErrorDetailValue(false)).toBe('false');
  });
  test('returns JSON for objects', () => { expect(formatAbsentErrorDetailValue({ key: 'val' })).toBe('{"key":"val"}'); });
  test('returns JSON for arrays', () => { expect(formatAbsentErrorDetailValue([1, 2])).toBe('[1,2]'); });
});

describe('formatAbsentExecutionError', () => {
  test('returns formatted string for plain Error', () => {
    const result = formatAbsentExecutionError({ stage: 'generate', error: new Error('test error') });
    expect(result).toContain('Stage: generate');
    expect(result).toContain('Error: test error');
  });

  test('defaults to unknown stage', () => {
    const result = formatAbsentExecutionError({ stage: null, error: new Error('err') });
    expect(result).toContain('Stage: unknown');
  });

  test('includes lastGenerateProgress when provided', () => {
    const result = formatAbsentExecutionError({
      stage: 'generate',
      error: new Error('err'),
      lastGenerateProgress: { stage: 'prepare-step', at: Date.now(), detail: { stepNumber: 3 } },
    });
    expect(result).toContain('Last progress stage: prepare-step');
    expect(result).toContain('Last progress detail: {"stepNumber":3}');
  });

  test('includes extracted error details', () => {
    const error = new Error('http') as Error & { statusCode: number; url: string };
    error.statusCode = 500;
    error.url = 'https://api.example.com';
    const result = formatAbsentExecutionError({ stage: 'execute', error });
    expect(result).toContain('statusCode: 500');
    expect(result).toContain('url: https://api.example.com');
  });

  test('handles non-Error inputs', () => {
    const result = formatAbsentExecutionError({ stage: 'test', error: 'plain string error' });
    expect(result).toContain('Stage: test');
    expect(result).toContain('plain string error');
  });

  test('handles Error subclasses', () => {
    class ApiError extends Error {
      statusCode = 418;
      constructor() { super('I am a teapot'); this.name = 'ApiError'; }
    }
    const result = formatAbsentExecutionError({ stage: 'api', error: new ApiError() });
    expect(result).toContain('Stage: api');
    expect(result).toContain('ApiError: I am a teapot');
    expect(result).toContain('statusCode: 418');
  });
});

describe('buildStepSystemPrompt', () => {
  test('returns null when no instructions', () => {
    expect(buildStepSystemPrompt({ agentContextInstructions: null })).toBeNull();
    expect(buildStepSystemPrompt({ agentContextInstructions: undefined })).toBeNull();
    expect(buildStepSystemPrompt({ agentContextInstructions: '' })).toBeNull();
    expect(buildStepSystemPrompt({ agentContextInstructions: '   ' })).toBeNull();
  });

  test('returns trimmed string for valid instructions', () => {
    expect(buildStepSystemPrompt({ agentContextInstructions: '  do things  \n\n  ' })).toBe('do things');
  });
});

describe('extractRunnerControlDirective', () => {
  test('returns stop when STOP_AND_IDLE found in text', () => {
    expect(extractRunnerControlDirective({ text: 'hello STOP_AND_IDLE world' })).toBe('stop');
  });

  test('returns stop when STOP_AND_IDLE on its own line', () => {
    expect(extractRunnerControlDirective({ text: 'hello\nSTOP_AND_IDLE\nworld' })).toBe('stop');
  });

  test('returns ignore when NO_ACTION_NEEDED found in text', () => {
    expect(extractRunnerControlDirective({ text: 'hello NO_ACTION_NEEDED world' })).toBe('ignore');
  });

  test('prefers stop over ignore when both present', () => {
    expect(extractRunnerControlDirective({ text: 'STOP_AND_IDLE and NO_ACTION_NEEDED' })).toBe('stop');
  });

  test('returns null when no directive found', () => {
    expect(extractRunnerControlDirective({ text: 'normal text' })).toBeNull();
  });

  test('trims whitespace before checking', () => {
    expect(extractRunnerControlDirective({ text: '  STOP_AND_IDLE  ' })).toBe('stop');
  });

  test('returns null for empty text', () => {
    expect(extractRunnerControlDirective({ text: '' })).toBeNull();
  });

  test('returns null for whitespace-only text', () => {
    expect(extractRunnerControlDirective({ text: '   \n  ' })).toBeNull();
  });

  test('checks steps response uiMessages', () => {
    const result = extractRunnerControlDirective({
      text: 'normal',
      steps: [{
        response: {
          uiMessages: [{ parts: [{ type: 'text', text: 'some text STOP_AND_IDLE here' }] }],
        },
      }],
    });
    expect(result).toBe('stop');
  });
});

describe('extractRunnerControlDirectiveFromIteration', () => {
  test('returns stop for STOP_AND_IDLE in text', () => {
    expect(extractRunnerControlDirectiveFromIteration({ text: 'STOP_AND_IDLE' })).toBe('stop');
  });

  test('returns ignore for NO_ACTION_NEEDED in text', () => {
    expect(extractRunnerControlDirectiveFromIteration({ text: 'NO_ACTION_NEEDED' })).toBe('ignore');
  });

  test('returns null for plain text', () => {
    expect(extractRunnerControlDirectiveFromIteration({ text: 'doing work' })).toBeNull();
  });

  test('trims text before checking', () => {
    expect(extractRunnerControlDirectiveFromIteration({ text: '  STOP_AND_IDLE  ' })).toBe('stop');
    expect(extractRunnerControlDirectiveFromIteration({ text: '\nNO_ACTION_NEEDED\n' })).toBe('ignore');
  });

  test('returns null for empty string', () => {
    expect(extractRunnerControlDirectiveFromIteration({ text: '' })).toBeNull();
  });
});

describe('buildRecallStepFromIteration', () => {
  test('maps iteration to recall step format', () => {
    const iteration = {
      text: 'hello world',
      toolCalls: [
        { name: 'send_message', args: { content: 'hi' } },
        { name: 'updateWorkingMemory', args: { notes: 'test' } },
      ],
      toolResults: [{ name: 'send_message', result: { delivered: true } }],
    };
    const step = buildRecallStepFromIteration(iteration);
    expect(step.text).toBe('hello world');
    expect(step.toolCalls).toEqual([
      { toolName: 'send_message', args: { content: 'hi' } },
      { toolName: 'updateWorkingMemory', args: { notes: 'test' } },
    ]);
    expect(step.toolResults).toEqual([{ toolName: 'send_message', result: { delivered: true } }]);
  });

  test('handles empty toolCalls and toolResults', () => {
    const step = buildRecallStepFromIteration({ text: 'test', toolCalls: [], toolResults: [] });
    expect(step.toolCalls).toEqual([]);
    expect(step.toolResults).toEqual([]);
  });
});

describe('didIterationProduceVisibleAssistantText', () => {
  test('returns true when iteration.text is non-empty', () => {
    expect(didIterationProduceVisibleAssistantText({ text: 'hello', messages: [] })).toBe(true);
  });

  test('returns true for whitespace-only text', () => {
    expect(didIterationProduceVisibleAssistantText({ text: '  \n  ', messages: [] })).toBe(true);
  });

  test('returns false for empty text and empty messages', () => {
    expect(didIterationProduceVisibleAssistantText({ text: '', messages: [] })).toBe(false);
  });

  test('returns true when assistant message has string content', () => {
    expect(didIterationProduceVisibleAssistantText({
      text: '',
      messages: [{ role: 'assistant', content: 'hello from message' }],
    })).toBe(true);
  });

  test('returns false when assistant message has empty content', () => {
    expect(didIterationProduceVisibleAssistantText({
      text: '',
      messages: [{ role: 'assistant', content: '' }],
    })).toBe(false);
  });

  test('returns true from text part in array content', () => {
    expect(didIterationProduceVisibleAssistantText({
      text: '',
      messages: [{ role: 'assistant', content: [{ type: 'text', text: 'hello from part' }] }],
    })).toBe(true);
  });

  test('skips non-assistant messages', () => {
    expect(didIterationProduceVisibleAssistantText({
      text: '',
      messages: [
        { role: 'user', content: 'user message' },
        { role: 'system', content: 'system message' },
      ],
    })).toBe(false);
  });

  test('skips messages with no role', () => {
    expect(didIterationProduceVisibleAssistantText({ text: '', messages: [{ content: 'no role' }] })).toBe(false);
  });
});

describe('collectStepTextParts', () => {
  test('returns empty array for empty steps', () => {
    expect(collectStepTextParts([])).toEqual([]);
  });

  test('returns empty array for steps without uiMessages', () => {
    expect(collectStepTextParts([{}])).toEqual([]);
  });

  test('extracts text parts from uiMessages', () => {
    const steps = [{
      response: {
        uiMessages: [{
          parts: [
            { type: 'text', text: 'first message' },
            { type: 'image', image: 'data' },
          ],
        }],
      },
    }];
    expect(collectStepTextParts(steps)).toEqual(['first message']);
  });

  test('extracts from multiple steps and messages', () => {
    const steps = [
      {
        response: {
          uiMessages: [{
            parts: [{ type: 'text', text: 'step1-msg1' }, { type: 'text', text: 'step1-msg2' }],
          }],
        },
      },
      {
        response: {
          uiMessages: [{
            parts: [{ type: 'text', text: 'step2-msg1' }],
          }],
        },
      },
    ];
    expect(collectStepTextParts(steps)).toEqual(['step1-msg1', 'step1-msg2', 'step2-msg1']);
  });

  test('skips parts without type=text', () => {
    const steps = [{
      response: {
        uiMessages: [{
          parts: [{ type: 'text', text: 'visible' }, { type: 'other', text: 'ignored' }],
        }],
      },
    }];
    expect(collectStepTextParts(steps)).toEqual(['visible']);
  });

  test('skips non-object parts', () => {
    const steps = [{
      response: {
        uiMessages: [{
          parts: ['string part', null, { type: 'text', text: 'valid' }],
        }],
      },
    }];
    expect(collectStepTextParts(steps)).toEqual(['valid']);
  });
});

describe('hasExactControlDirective', () => {
  test('returns true when directive appears in a line', () => {
    expect(hasExactControlDirective('normal text STOP_AND_IDLE here', 'STOP_AND_IDLE')).toBe(true);
  });

  test('returns true when directive is on its own line', () => {
    expect(hasExactControlDirective('line1\nSTOP_AND_IDLE\nline3', 'STOP_AND_IDLE')).toBe(true);
  });

  test('trims whitespace around lines', () => {
    expect(hasExactControlDirective('  STOP_AND_IDLE  ', 'STOP_AND_IDLE')).toBe(true);
    expect(hasExactControlDirective('\n  STOP_AND_IDLE  \n', 'STOP_AND_IDLE')).toBe(true);
  });

  test('returns false when directive not found', () => {
    expect(hasExactControlDirective('normal text', 'STOP_AND_IDLE')).toBe(false);
  });

  test('returns false for empty text', () => {
    expect(hasExactControlDirective('', 'STOP_AND_IDLE')).toBe(false);
  });

  test('works with different directives', () => {
    expect(hasExactControlDirective('work NO_ACTION_NEEDED done', 'NO_ACTION_NEEDED')).toBe(true);
    expect(hasExactControlDirective('work NO_ACTION_NEEDED done', 'STOP_AND_IDLE')).toBe(false);
  });
});
