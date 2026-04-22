import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  generateTextMock,
  streamTextMock,
  toolMock,
} = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
  streamTextMock: vi.fn(),
  toolMock: vi.fn((definition: unknown) => definition),
}));

vi.mock('ai', () => ({
  generateText: generateTextMock,
  streamText: streamTextMock,
  tool: toolMock,
}));

import { AiSdkStepModelAdapter } from '../integrations/adapters/ai-sdk.js';
import { createImageStepContextEntry, createTextStepContextEntry } from '../core/step-context.js';

describe('AiSdkStepModelAdapter', () => {
  beforeEach(() => {
    generateTextMock.mockReset();
    streamTextMock.mockReset();
    toolMock.mockClear();
  });

  it('sends multimodal context as ai sdk messages', async () => {
    generateTextMock.mockResolvedValue({
      content: [{ type: 'text', text: 'done' }],
      toolCalls: [],
      usage: {},
    });

    const adapter = new AiSdkStepModelAdapter({
      model: {} as never,
    });

    await adapter.generateStep({
      runtimeId: 'runtime-1',
      stepId: 'step-1',
      stepNumber: 1,
      context: [
        createTextStepContextEntry({
          id: 'entry-1',
          kind: 'input:chat',
          title: 'Input',
          text: 'hello',
        }),
        createImageStepContextEntry({
          id: 'entry-2',
          kind: 'vision',
          title: 'Screenshot',
          text: 'current screen',
          mimeType: 'image/png',
          bytes: new Uint8Array([1, 2, 3]),
        }),
      ],
      actions: [],
    });

    expect(generateTextMock).toHaveBeenCalledTimes(1);

    const request = generateTextMock.mock.calls[0]?.[0];
    const messages = request?.messages as Array<{ role: string; content: Array<{ type: string; text?: string; image?: string }> }>;

    expect(messages).toHaveLength(1);
    expect(messages[0]?.role).toBe('user');
    expect(messages[0]?.content[0]?.type).toBe('text');
    expect(messages[0]?.content[0]?.text).toContain('<entry id="entry-1"');
    expect(messages[0]?.content[0]?.text).not.toContain('bounded agent step');
    expect(messages[0]?.content[1]).toEqual({
      type: 'image',
      image: 'data:image/png;base64,AQID',
    });
    expect(Object.keys(request?.tools ?? {})).toEqual([]);
  });

  it('maps streamText output into runtime stream events and final response', async () => {
    streamTextMock.mockReturnValue({
      fullStream: (async function* () {
        yield { type: 'text-delta', text: 'hello ' };
        yield { type: 'reasoning-delta', text: 'thinking' };
        yield { type: 'tool-call', toolName: 'lookup', input: { query: 'forge' } };
      })(),
      content: Promise.resolve([
        { type: 'text', text: 'hello world' },
        { type: 'reasoning', text: 'thinking' },
      ]),
      toolCalls: Promise.resolve([
        { toolName: 'lookup', input: { query: 'forge' } },
      ]),
      usage: Promise.resolve({
        inputTokens: 10,
        outputTokens: 12,
      }),
    });

    const adapter = new AiSdkStepModelAdapter({
      model: {} as never,
    });
    const modelStream = await adapter.streamStep({
      runtimeId: 'runtime-1',
      stepId: 'step-1',
      stepNumber: 1,
      context: [
        createTextStepContextEntry({
          id: 'entry-1',
          kind: 'input:event',
          title: 'Event',
          text: 'hello',
        }),
      ],
      actions: [{
        name: 'lookup',
        description: 'Lookup information',
        inputSchema: {} as never,
        inputSchemaText: '{}',
      }],
    });
    const events = [];

    for await (const event of modelStream.events) {
      events.push(event);
    }

    const response = await modelStream.response;

    expect(events).toEqual([
      {
        type: 'segment-delta',
        segment: { kind: 'message', text: 'hello ' },
      },
      {
        type: 'segment-delta',
        segment: { kind: 'reasoning', text: 'thinking' },
      },
      {
        type: 'action-request',
        actionRequest: { name: 'lookup', input: { query: 'forge' } },
      },
    ]);
    expect(response.segments).toEqual([
      { kind: 'message', text: 'hello world' },
      { kind: 'reasoning', text: 'thinking' },
    ]);
    expect(response.actionRequests).toEqual([
      { name: 'lookup', input: { query: 'forge' } },
    ]);
    expect(response.continuation).toBe('stop');
    expect(response.usage).toEqual({
      inputTokens: 10,
      outputTokens: 12,
      totalTokens: undefined,
      cachedInputTokens: undefined,
      reasoningTokens: undefined,
    });
    expect(Object.keys(streamTextMock.mock.calls[0]?.[0]?.tools ?? {})).toEqual(['lookup']);
  });

  it('preserves conversation history and previous tool results as native ai sdk messages', async () => {
    generateTextMock.mockResolvedValue({
      content: [{ type: 'text', text: 'done' }],
      toolCalls: [],
      usage: {},
    });

    const adapter = new AiSdkStepModelAdapter({
      model: {} as never,
    });

    await adapter.generateStep({
      runtimeId: 'runtime-1',
      stepId: 'step-2',
      stepNumber: 2,
      context: [
        createTextStepContextEntry({
          id: 'conversation-message:user-1',
          kind: 'conversation-message:user',
          title: 'User message',
          text: 'Need a landing page.',
        }),
        createTextStepContextEntry({
          id: 'conversation-message:assistant-1',
          kind: 'conversation-message:assistant',
          title: 'Assistant message',
          text: 'I will create a plan.',
        }),
        createTextStepContextEntry({
          id: 'action-results:0',
          kind: 'action-results',
          title: 'Previous action results',
          text: JSON.stringify([
            {
              name: 'lookup',
              input: { query: 'landing page' },
              output: { ok: true },
            },
          ]),
        }),
        createTextStepContextEntry({
          id: 'conversation-message:user-2',
          kind: 'input:conversation-message:user',
          title: 'User message',
          text: 'Use the warm design system.',
        }),
      ],
      actions: [],
    });

    const request = generateTextMock.mock.calls[0]?.[0];
    const messages = request?.messages as Array<{ role: string; content: unknown }>;

    expect(messages).toEqual([
      {
        role: 'user',
        content: [{ type: 'text', text: 'Need a landing page.' }],
      },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'I will create a plan.' }],
      },
      {
        role: 'assistant',
        content: [{
          type: 'tool-call',
          toolCallId: 'action-results:0:0',
          toolName: 'lookup',
          input: { query: 'landing page' },
        }],
      },
      {
        role: 'tool',
        content: [{
          type: 'tool-result',
          toolCallId: 'action-results:0:0',
          toolName: 'lookup',
          output: {
            type: 'json',
            value: { ok: true },
          },
        }],
      },
      {
        role: 'user',
        content: [{ type: 'text', text: 'Use the warm design system.' }],
      },
    ]);
  });

  it('consolidates runtime system instructions into the ai sdk system prompt', async () => {
    generateTextMock.mockResolvedValue({
      content: [{ type: 'text', text: 'done' }],
      toolCalls: [],
      usage: {},
    });

    const adapter = new AiSdkStepModelAdapter({
      model: {} as never,
    });

    await adapter.generateStep({
      runtimeId: 'runtime-1',
      stepId: 'step-3',
      stepNumber: 3,
      context: [
        createTextStepContextEntry({
          id: 'system-1',
          kind: 'system-instruction',
          title: 'System Instruction',
          text: 'Stay concise.',
        }),
        createTextStepContextEntry({
          id: 'conversation-message:user-3',
          kind: 'input:conversation-message:user',
          title: 'User message',
          text: 'Reply now.',
        }),
      ],
      actions: [],
    });

    const request = generateTextMock.mock.calls[0]?.[0];
    const messages = request?.messages as Array<{ role: string; content: unknown }>;

    expect(request?.system).toBe('Stay concise.');
    expect(messages).toEqual([{
      role: 'user',
      content: [{ type: 'text', text: 'Reply now.' }],
    }]);
  });

  it('merges adapter system text with context system text into one ai sdk system prompt', async () => {
    generateTextMock.mockResolvedValue({
      content: [{ type: 'text', text: 'done' }],
      toolCalls: [],
      usage: {},
    });

    const adapter = new AiSdkStepModelAdapter({
      model: {} as never,
      system: 'Base system.',
    });

    await adapter.generateStep({
      runtimeId: 'runtime-1',
      stepId: 'step-4',
      stepNumber: 4,
      context: [
        createTextStepContextEntry({
          id: 'system-1',
          kind: 'system-instruction',
          title: 'System Instruction',
          text: 'Stay concise.',
        }),
        createTextStepContextEntry({
          id: 'conversation-message:user-4',
          kind: 'input:conversation-message:user',
          title: 'User message',
          text: 'Reply now.',
        }),
      ],
      actions: [],
    });

    const request = generateTextMock.mock.calls[0]?.[0];

    expect(request?.system).toBe('Base system.\n\nStay concise.');
  });
});
