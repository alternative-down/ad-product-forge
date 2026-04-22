import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  generateTextMock,
  stepCountIsMock,
  toolMock,
} = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
  stepCountIsMock: vi.fn((count: number) => ({ count })),
  toolMock: vi.fn((definition: unknown) => definition),
}));

vi.mock('ai', () => ({
  generateText: generateTextMock,
  stepCountIs: stepCountIsMock,
  tool: toolMock,
}));

import { createTool } from './tools.js';
import { runNativeToolLoop } from './native-tool-loop.js';

describe('runNativeToolLoop', () => {
  beforeEach(() => {
    generateTextMock.mockReset();
    stepCountIsMock.mockClear();
    toolMock.mockClear();
  });

  it('returns a deferred tool call without executing that tool in app code', async () => {
    const executeSpy = vi.fn();

    generateTextMock.mockResolvedValue({
      text: '',
      finishReason: 'tool-calls',
      totalUsage: {
        inputTokens: 10,
        outputTokens: 5,
      },
      toolCalls: [{
        toolName: 'hireAgent',
        input: {
          agent: {
            agentName: 'Meraxis',
          },
        },
      }],
      response: {
        messages: [{
          role: 'assistant',
          content: [{
            type: 'tool-call',
            toolCallId: 'tool-1',
            toolName: 'hireAgent',
            input: {
              agent: {
                agentName: 'Meraxis',
              },
            },
          }],
        }],
      },
    });

    const hireAgent = createTool({
      id: 'hireAgent',
      description: 'Hire an agent',
      inputSchema: {
        parse(input: unknown) {
          return input;
        },
      },
      execute: executeSpy,
    });

    const result = await runNativeToolLoop({
      model: {} as never,
      system: 'System prompt',
      prompt: 'Hire a designer',
      tools: {
        hireAgent,
      },
      deferredToolNames: ['hireAgent'],
      runtimeId: 'internal-hiring-rh',
    });

    expect(toolMock).toHaveBeenCalledTimes(1);
    expect(toolMock.mock.calls[0]?.[0]).toMatchObject({
      description: 'Hire an agent',
    });
    expect(toolMock.mock.calls[0]?.[0]).not.toHaveProperty('execute');
    expect(stepCountIsMock).toHaveBeenCalledWith(20);
    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(result.deferredToolCall).toEqual({
      toolName: 'hireAgent',
      input: {
        agent: {
          agentName: 'Meraxis',
        },
      },
    });
    expect(result.usage).toEqual({
      inputTokens: 10,
      outputTokens: 5,
    });
    expect(executeSpy).not.toHaveBeenCalled();
  });
});
