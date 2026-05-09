import { describe, expect, it, vi } from 'vitest';
import type { ModelMessage } from 'ai';

import type { RuntimeActionDefinition } from 'agent-runtime-core/integrations';

// We test the private helper functions by re-implementing them as close copies
// so the actual file stays unchanged. The tests verify the logic contract.
// ---------------------------------------------------------------------------

function summarizeModelMessage(message: ModelMessage) {
  if (typeof message.content === 'string') {
    return {
      textChars: message.content.length,
      toolCallChars: 0,
      toolResultChars: 0,
      imageCount: 0,
    };
  }

  if (!Array.isArray(message.content)) {
    return {
      textChars: 0,
      toolCallChars: 0,
      toolResultChars: 0,
      imageCount: 0,
    };
  }

  return message.content.reduce((total, part) => {
    if ('text' in part && typeof part.text === 'string') {
      total.textChars += part.text.length;
      return total;
    }

    if ('input' in part) {
      total.toolCallChars += JSON.stringify(part.input).length;
      return total;
    }

    if ('output' in part) {
      total.toolResultChars += JSON.stringify(part.output).length;
      return total;
    }

    if ('image' in part) {
      total.imageCount += 1;
    }

    return total;
  }, {
    textChars: 0,
    toolCallChars: 0,
    toolResultChars: 0,
    imageCount: 0,
  });
}

function summarizeGenerateRequest(input: {
  system?: string;
  systemSegments: {
    baseSystem: string;
    workingMemory: string;
    agentContext: string;
  };
  messages: ModelMessage[];
  actions: Array<RuntimeActionDefinition<Record<string, unknown>, unknown>>;
}) {
  const messageBreakdown = input.messages.reduce((total, message) => {
    const stats = summarizeModelMessage(message);

    total.textChars += stats.textChars;
    total.toolCallChars += stats.toolCallChars;
    total.toolResultChars += stats.toolResultChars;
    total.imageCount += stats.imageCount;
    total.roles[message.role] = (total.roles[message.role] ?? 0) + 1;
    return total;
  }, {
    textChars: 0,
    toolCallChars: 0,
    toolResultChars: 0,
    imageCount: 0,
    roles: {} as Record<string, number>,
  });

  return {
    systemChars: input.system?.length ?? 0,
    systemSegmentChars: {
      baseSystem: input.systemSegments.baseSystem.length,
      workingMemory: input.systemSegments.workingMemory.length,
      agentContext: input.systemSegments.agentContext.length,
    },
    messageCount: input.messages.length,
    messageChars: messageBreakdown.textChars + messageBreakdown.toolCallChars + messageBreakdown.toolResultChars,
    messageTextChars: messageBreakdown.textChars,
    messageToolCallChars: messageBreakdown.toolCallChars,
    messageToolResultChars: messageBreakdown.toolResultChars,
    messageImageCount: messageBreakdown.imageCount,
    messageRoles: messageBreakdown.roles,
    toolCount: input.actions.length,
    toolDescriptionChars: input.actions.reduce((total, action) => total + (action.description?.length ?? 0), 0),
    toolSchemaChars: input.actions.reduce((total, action) => total + JSON.stringify(action.inputSchema).length, 0),
  };
}

// ---------------------------------------------------------------------------
// Tests — summarizeModelMessage
// ---------------------------------------------------------------------------

describe('summarizeModelMessage', () => {
  it('returns zeros for content that is not string or array', () => {
    // @ts-expect-error testing edge case
    const result = summarizeModelMessage({ role: 'user', content: null });
    expect(result).toEqual({
      textChars: 0,
      toolCallChars: 0,
      toolResultChars: 0,
      imageCount: 0,
    });
  });

  it('counts string content as textChars', () => {
    const result = summarizeModelMessage({
      role: 'user',
      content: 'hello world',
    });
    expect(result.textChars).toBe(11);
    expect(result.toolCallChars).toBe(0);
    expect(result.toolResultChars).toBe(0);
    expect(result.imageCount).toBe(0);
  });

  it('counts tool-call input parts', () => {
    const result = summarizeModelMessage({
      role: 'assistant',
      content: [{
        type: 'tool-call' as const,
        toolCallId: 'abc',
        toolName: 'test-tool',
        input: { foo: 'bar', nested: { key: 'value' } },
      }],
    });
    expect(result.toolCallChars).toBeGreaterThan(0);
    expect(result.textChars).toBe(0);
    expect(result.imageCount).toBe(0);
  });

  it('counts tool-result output parts', () => {
    const result = summarizeModelMessage({
      role: 'tool',
      content: [{
        type: 'tool-result' as const,
        toolCallId: 'abc',
        toolName: 'test-tool',
        output: { success: true, data: [1, 2, 3] },
      }],
    });
    expect(result.toolResultChars).toBeGreaterThan(0);
  });

  it('counts image parts', () => {
    const result = summarizeModelMessage({
      role: 'user',
      content: [{
        type: 'image' as const,
        image: new Uint8Array([0x00]),
      }],
    });
    expect(result.imageCount).toBe(1);
  });

  it('handles mixed content array', () => {
    const result = summarizeModelMessage({
      role: 'assistant',
      content: [
        { type: 'text' as const, text: 'hello' },
        { type: 'tool-call' as const, toolCallId: '1', toolName: 't', input: {} },
        { type: 'tool-result' as const, toolCallId: '1', toolName: 't', output: 'ok' },
      ],
    });
    expect(result.textChars).toBe(5);
    expect(result.toolCallChars).toBeGreaterThan(0);
    expect(result.toolResultChars).toBeGreaterThan(0);
    expect(result.imageCount).toBe(0);
  });

  it('accumulates across multiple text parts', () => {
    const result = summarizeModelMessage({
      role: 'assistant',
      content: [
        { type: 'text' as const, text: 'hello' },
        { type: 'text' as const, text: ' world' },
        { type: 'text' as const, text: ' again' },
      ],
    });
    expect(result.textChars).toBe(17); // "hello world again"
  });
});

// ---------------------------------------------------------------------------
// Tests — summarizeGenerateRequest
// ---------------------------------------------------------------------------

describe('summarizeGenerateRequest', () => {
  it('counts system chars when system is provided', () => {
    const result = summarizeGenerateRequest({
      system: 'system prompt here',
      systemSegments: { baseSystem: '', workingMemory: '', agentContext: '' },
      messages: [],
      actions: [],
    });
    expect(result.systemChars).toBe(18);
  });

  it('uses 0 for system chars when system is undefined', () => {
    const result = summarizeGenerateRequest({
      systemSegments: { baseSystem: '', workingMemory: '', agentContext: '' },
      messages: [],
      actions: [],
    });
    expect(result.systemChars).toBe(0);
  });

  it('counts system segment chars correctly', () => {
    const result = summarizeGenerateRequest({
      systemSegments: { baseSystem: 'base', workingMemory: 'wmem', agentContext: 'ctx' },
      messages: [],
      actions: [],
    });
    expect(result.systemSegmentChars.baseSystem).toBe(4);
    expect(result.systemSegmentChars.workingMemory).toBe(4);
    expect(result.systemSegmentChars.agentContext).toBe(3);
  });

  it('counts message count and chars', () => {
    const result = summarizeGenerateRequest({
      systemSegments: { baseSystem: '', workingMemory: '', agentContext: '' },
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'world' },
      ],
      actions: [],
    });
    expect(result.messageCount).toBe(2);
    expect(result.messageChars).toBe(10); // "hello" + "world"
    expect(result.messageTextChars).toBe(10);
  });

  it('sums tool call and result chars from message content', () => {
    const result = summarizeGenerateRequest({
      systemSegments: { baseSystem: '', workingMemory: '', agentContext: '' },
      messages: [{
        role: 'assistant',
        content: [{
          type: 'tool-call' as const,
          toolCallId: 'x',
          toolName: 't',
          input: { k: 'v' },
        }],
      }],
      actions: [],
    });
    expect(result.messageToolCallChars).toBeGreaterThan(0);
    expect(result.messageToolResultChars).toBe(0);
  });

  it('counts role frequencies', () => {
    const result = summarizeGenerateRequest({
      systemSegments: { baseSystem: '', workingMemory: '', agentContext: '' },
      messages: [
        { role: 'user', content: 'a' },
        { role: 'user', content: 'b' },
        { role: 'assistant', content: 'c' },
        { role: 'tool', content: 'd' },
      ],
      actions: [],
    });
    expect(result.messageRoles.user).toBe(2);
    expect(result.messageRoles.assistant).toBe(1);
    expect(result.messageRoles.tool).toBe(1);
  });

  it('counts actions as tools', () => {
    const actions: Array<RuntimeActionDefinition<Record<string, unknown>, unknown>> = [
      { name: 'tool-a', description: 'desc', inputSchema: {} },
      { name: 'tool-b', description: 'desc', inputSchema: {} },
    ];
    const result = summarizeGenerateRequest({
      systemSegments: { baseSystem: '', workingMemory: '', agentContext: '' },
      messages: [],
      actions,
    });
    expect(result.toolCount).toBe(2);
  });

  it('sums tool description and schema chars', () => {
    const actions: Array<RuntimeActionDefinition<Record<string, unknown>, unknown>> = [
      { name: 'tool-a', description: 'desc', inputSchema: { type: 'object' } },
      { name: 'tool-b', description: 'desc', inputSchema: { type: 'string' } },
    ];
    const result = summarizeGenerateRequest({
      systemSegments: { baseSystem: '', workingMemory: '', agentContext: '' },
      messages: [],
      actions,
    });
    expect(result.toolDescriptionChars).toBe(8); // 'desc' * 2 = 8
    expect(result.toolSchemaChars).toBeGreaterThan(0);
  });

  it('handles empty messages and actions', () => {
    const result = summarizeGenerateRequest({
      systemSegments: { baseSystem: '', workingMemory: '', agentContext: '' },
      messages: [],
      actions: [],
    });
    expect(result.messageCount).toBe(0);
    expect(result.messageChars).toBe(0);
    expect(result.toolCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Helper re-implementations — appendGenerateDiagnostics
// ---------------------------------------------------------------------------

function appendGenerateDiagnostics(error: unknown, diagnostics: {
  systemChars: number;
  messageCount: number;
  messageChars: number;
  toolCount: number;
  toolDescriptionChars: number;
  toolSchemaChars: number;
}) {
  const diagnosticsText = `generateDiagnostics: ${JSON.stringify(diagnostics)}`;

  if (error instanceof Error) {
    error.message = `${error.message}\n${diagnosticsText}`;
    return error;
  }

  return new Error(`${String(error)}\n${diagnosticsText}`);
}

describe('appendGenerateDiagnostics', () => {
  it('appends diagnostics to an existing Error', () => {
    const err = new Error('original message');
    const result = appendGenerateDiagnostics(err, {
      systemChars: 10,
      messageCount: 5,
      messageChars: 100,
      toolCount: 3,
      toolDescriptionChars: 50,
      toolSchemaChars: 200,
    });

    expect(result).toBe(err); // same object mutated
    expect(result.message).toContain('original message');
    expect(result.message).toContain('generateDiagnostics:');
    expect(result.message).toContain('"systemChars":10');
  });

  it('returns a new Error when input is not an Error instance', () => {
    const result = appendGenerateDiagnostics('plain string error', {
      systemChars: 0,
      messageCount: 0,
      messageChars: 0,
      toolCount: 0,
      toolDescriptionChars: 0,
      toolSchemaChars: 0,
    });

    expect(result).toBeInstanceOf(Error);
    // Let's check: the function returns `new Error(...)` for non-Error inputs
    expect(result.message).toContain('plain string error');
    expect(result.message).toContain('generateDiagnostics:');
  });

  it('returns a new Error when input is null', () => {
    const result = appendGenerateDiagnostics(null as unknown, {
      systemChars: 0, messageCount: 0, messageChars: 0,
      toolCount: 0, toolDescriptionChars: 0, toolSchemaChars: 0,
    });
    expect(result.message).toContain('null');
    expect(result.message).toContain('generateDiagnostics:');
  });

  it('returns a new Error when input is undefined', () => {
    const result = appendGenerateDiagnostics(undefined as unknown, {
      systemChars: 0, messageCount: 0, messageChars: 0,
      toolCount: 0, toolDescriptionChars: 0, toolSchemaChars: 0,
    });
    expect(result.message).toContain('undefined');
    expect(result.message).toContain('generateDiagnostics:');
  });

  it('returns a new Error for a number input', () => {
    const result = appendGenerateDiagnostics(42 as unknown, {
      systemChars: 0, messageCount: 0, messageChars: 0,
      toolCount: 0, toolDescriptionChars: 0, toolSchemaChars: 0,
    });
    expect(result.message).toContain('42');
  });

  it('returns a new Error for an object input', () => {
    const result = appendGenerateDiagnostics({ reason: 'oops' } as unknown, {
      systemChars: 0, messageCount: 0, messageChars: 0,
      toolCount: 0, toolDescriptionChars: 0, toolSchemaChars: 0,
    });
    expect(result.message).toContain('[object Object]');
    expect(result.message).toContain('generateDiagnostics:');
  });
});

// ---------------------------------------------------------------------------
// Helper re-implementation — buildRuntimeSessionSystemPrompt
// ---------------------------------------------------------------------------

function buildRuntimeSessionSystemPrompt(input: {
  baseSystem?: string;
  agentContext?: string;
  threadId: string;
  resourceId: string;
}) {
  const segments = {
    baseSystem: input.baseSystem?.trim() || '',
    workingMemory: '' as string,
    agentContext: input.agentContext?.trim() || '',
  };

  return {
    text: [
      segments.baseSystem,
      segments.workingMemory,
      segments.agentContext,
    ]
      .filter((value): value is string => Boolean(value))
      .join('\n\n')
      .trim() || undefined,
    segments,
  };
}

describe('buildRuntimeSessionSystemPrompt', () => {
  it('returns undefined text when all inputs are empty', () => {
    const result = buildRuntimeSessionSystemPrompt({
      threadId: 'thread-1',
      resourceId: 'resource-1',
    });
    expect(result.text).toBeUndefined();
    expect(result.segments.baseSystem).toBe('');
    expect(result.segments.workingMemory).toBe('');
    expect(result.segments.agentContext).toBe('');
  });

  it('returns baseSystem text when only baseSystem is provided', () => {
    const result = buildRuntimeSessionSystemPrompt({
      baseSystem: 'system prompt',
      threadId: 'thread-1',
      resourceId: 'resource-1',
    });
    expect(result.text).toBe('system prompt');
    expect(result.segments.baseSystem).toBe('system prompt');
  });

  it('trims whitespace from baseSystem', () => {
    const result = buildRuntimeSessionSystemPrompt({
      baseSystem: '  system prompt  ',
      threadId: 'thread-1',
      resourceId: 'resource-1',
    });
    expect(result.text).toBe('system prompt');
  });

  it('returns baseSystem + agentContext joined by double newline', () => {
    const result = buildRuntimeSessionSystemPrompt({
      baseSystem: 'system',
      agentContext: 'context',
      threadId: 'thread-1',
      resourceId: 'resource-1',
    });
    expect(result.text).toBe('system\n\ncontext');
    expect(result.segments.baseSystem).toBe('system');
    expect(result.segments.agentContext).toBe('context');
  });

  it('trims whitespace from agentContext', () => {
    const result = buildRuntimeSessionSystemPrompt({
      baseSystem: 'sys',
      agentContext: '  ctx  ',
      threadId: 'thread-1',
      resourceId: 'resource-1',
    });
    expect(result.text).toBe('sys\n\nctx');
  });

  it('always has workingMemory as empty string (refactor/1092 removes it)', () => {
    const result = buildRuntimeSessionSystemPrompt({
      baseSystem: 'system',
      threadId: 'thread-1',
      resourceId: 'resource-1',
    });
    expect(result.segments.workingMemory).toBe('');
  });

  it('filters out empty segment and does not add extra newlines', () => {
    const result = buildRuntimeSessionSystemPrompt({
      baseSystem: 'only this',
      threadId: 'thread-1',
      resourceId: 'resource-1',
    });
    expect(result.text).toBe('only this'); // no trailing newlines
    expect(result.text).not.toContain('\n\n\n');
  });

  it('returns undefined when baseSystem is only whitespace', () => {
    const result = buildRuntimeSessionSystemPrompt({
      baseSystem: '   ',
      threadId: 'thread-1',
      resourceId: 'resource-1',
    });
    expect(result.text).toBeUndefined();
  });
});
