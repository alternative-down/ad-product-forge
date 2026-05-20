import { describe, expect, it, vi } from 'vitest';
import {
  createRuntimeAgentSessionIteration,
  resolveRuntimeAgentSessionContinuation,
} from './runtime-agent-session-iteration.js';
import type { RuntimeAgentSessionIteration } from './runtime-agent-session.js';
import type { RuntimeAgentSessionGenerateOptions } from './runtime-agent-session.js';
import type { RuntimeSessionModelMessage } from './runtime-agent-session-messages.js';

const makeMessage = (
  overrides: Partial<RuntimeSessionModelMessage> = {},
): RuntimeSessionModelMessage =>
  ({
    role: 'assistant',
    content: [],
    ...overrides,
  }) as RuntimeSessionModelMessage;

describe('runtime-agent-session-iteration', () => {
  describe('createRuntimeAgentSessionIteration', () => {
    it('creates iteration with no tool calls or results', () => {
      const result = createRuntimeAgentSessionIteration({
        iterationNumber: 1,
        responseMessages: [
          makeMessage({ role: 'assistant', content: [{ type: 'text', text: 'Hello' }] }),
        ],
        text: 'Hello',
        finishReason: 'stop',
        runId: 'run-1',
        threadId: 'thread-1',
        resourceId: 'res-1',
        agentId: 'agent-1',
        agentName: 'TestAgent',
      });
      expect(result.iteration).toBe(1);
      expect(result.text).toBe('Hello');
      expect(result.finishReason).toBe('stop');
      expect(result.toolCalls).toEqual([]);
      expect(result.toolResults).toEqual([]);
      expect(result.isFinal).toBe(true);
    });

    it('extracts tool-calls from assistant message content', () => {
      const result = createRuntimeAgentSessionIteration({
        iterationNumber: 2,
        responseMessages: [
          makeMessage({
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'tc-1',
                toolName: 'search',
                input: { query: 'test' },
              },
            ],
          }),
        ],
        text: 'Using search',
        finishReason: 'tool-calls',
        runId: 'run-2',
        threadId: 'thread-1',
        resourceId: 'res-1',
        agentId: 'agent-1',
        agentName: 'Agent',
      });
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0]).toEqual({
        id: 'tc-1',
        name: 'search',
        args: { query: 'test' },
      });
      expect(result.isFinal).toBe(false);
    });

    it('generates tool-call id from indices when toolCallId is missing', () => {
      const result = createRuntimeAgentSessionIteration({
        iterationNumber: 3,
        responseMessages: [
          makeMessage({
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolName: 'search',
                input: {},
              },
            ],
          }),
        ],
        text: '',
        finishReason: 'stop',
        runId: 'run-3',
        threadId: 'thread-1',
        resourceId: 'res-1',
        agentId: 'agent-1',
        agentName: 'Agent',
      });
      expect(result.toolCalls[0].id).toBe('3:0:0');
    });

    it('extracts tool-results from tool message content', () => {
      const result = createRuntimeAgentSessionIteration({
        iterationNumber: 4,
        responseMessages: [
          makeMessage({
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'tc-1',
                toolName: 'search',
                output: { type: 'json', value: ['result 1', 'result 2'] },
              },
            ],
          }),
        ],
        text: '',
        finishReason: 'stop',
        runId: 'run-4',
        threadId: 'thread-1',
        resourceId: 'res-1',
        agentId: 'agent-1',
        agentName: 'Agent',
      });
      expect(result.toolResults).toHaveLength(1);
      expect(result.toolResults[0].result).toEqual(['result 1', 'result 2']);
    });

    it('generates tool-result id from indices when toolCallId is missing', () => {
      const result = createRuntimeAgentSessionIteration({
        iterationNumber: 5,
        responseMessages: [
          makeMessage({
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolName: 'search',
                output: 'plain output',
              },
            ],
          }),
        ],
        text: '',
        finishReason: 'stop',
        runId: 'run-5',
        threadId: 'thread-1',
        resourceId: 'res-1',
        agentId: 'agent-1',
        agentName: 'Agent',
      });
      expect(result.toolResults[0].id).toBe('5:0:0');
    });

    it('sets isFinal to false when tool calls present', () => {
      const result = createRuntimeAgentSessionIteration({
        iterationNumber: 6,
        responseMessages: [
          makeMessage({
            role: 'assistant',
            content: [{ type: 'tool-call', toolCallId: 'tc-x', toolName: 'x', input: {} }],
          }),
        ],
        text: '',
        finishReason: 'tool-calls',
        runId: 'run-6',
        threadId: 'thread-1',
        resourceId: 'res-1',
        agentId: 'agent-1',
        agentName: 'Agent',
      });
      expect(result.isFinal).toBe(false);
    });

    it('passes through non-tool-call/content parts unchanged', () => {
      const result = createRuntimeAgentSessionIteration({
        iterationNumber: 7,
        responseMessages: [
          makeMessage({ role: 'assistant', content: [{ type: 'text', text: 'plain text' }] }),
          makeMessage({ role: 'system', content: [{ type: 'text', text: 'system' }] }),
        ],
        text: '',
        finishReason: 'stop',
        runId: 'run-7',
        threadId: 'thread-1',
        resourceId: 'res-1',
        agentId: 'agent-1',
        agentName: 'Agent',
      });
      expect(result.messages).toHaveLength(2);
    });

    it('uses default finish reason stop when undefined', () => {
      const result = createRuntimeAgentSessionIteration({
        iterationNumber: 8,
        responseMessages: [],
        text: '',
        finishReason: undefined,
        runId: 'run-8',
        threadId: 'thread-1',
        resourceId: 'res-1',
        agentId: 'agent-1',
        agentName: 'Agent',
      });
      expect(result.finishReason).toBe('stop');
    });
  });

  describe('resolveRuntimeAgentSessionContinuation', () => {
    const makeIteration = (
      overrides: Partial<RuntimeAgentSessionIteration> = {},
    ): RuntimeAgentSessionIteration =>
      ({
        iteration: 1,
        text: '',
        toolCalls: [],
        toolResults: [],
        isFinal: false,
        finishReason: 'stop',
        runId: 'run-1',
        threadId: 'thread-1',
        resourceId: 'res-1',
        agentId: 'agent-1',
        agentName: 'Agent',
        messages: [],
        ...overrides,
      }) as RuntimeAgentSessionIteration;

    it('returns explicit continue true from callback', async () => {
      const opts: RuntimeAgentSessionGenerateOptions = {
        onIterationComplete: vi.fn().mockResolvedValue({ continue: true }),
      };
      const result = await resolveRuntimeAgentSessionContinuation({
        options: opts,
        iteration: makeIteration(),
      });
      expect(result.continue).toBe(true);
    });

    it('returns explicit continue false from callback', async () => {
      const opts: RuntimeAgentSessionGenerateOptions = {
        onIterationComplete: vi.fn().mockResolvedValue({ continue: false }),
      };
      const result = await resolveRuntimeAgentSessionContinuation({
        options: opts,
        iteration: makeIteration(),
      });
      expect(result.continue).toBe(false);
    });

    it('continues when tool calls are present and no callback', async () => {
      const opts: RuntimeAgentSessionGenerateOptions = {};
      const result = await resolveRuntimeAgentSessionContinuation({
        options: opts,
        iteration: makeIteration({ toolCalls: [{ id: 'tc-1', name: 'x', args: {} }] }),
      });
      expect(result.continue).toBe(true);
    });

    it('continues when tool results are present and no callback', async () => {
      const opts: RuntimeAgentSessionGenerateOptions = {};
      const result = await resolveRuntimeAgentSessionContinuation({
        options: opts,
        iteration: makeIteration({ toolResults: [{ id: 'tr-1', name: 'x', result: 'ok' }] }),
      });
      expect(result.continue).toBe(true);
    });

    it('stops when no tool calls/results and no callback', async () => {
      const opts: RuntimeAgentSessionGenerateOptions = {};
      const result = await resolveRuntimeAgentSessionContinuation({
        options: opts,
        iteration: makeIteration({ toolCalls: [], toolResults: [] }),
      });
      expect(result.continue).toBe(false);
    });

    it('passes through feedback from callback', async () => {
      const opts: RuntimeAgentSessionGenerateOptions = {
        onIterationComplete: vi.fn().mockResolvedValue({ continue: true, feedback: 'Be faster' }),
      };
      const result = await resolveRuntimeAgentSessionContinuation({
        options: opts,
        iteration: makeIteration(),
      });
      expect(result.feedback).toBe('Be faster');
    });

    it('passes through feedbackMessages from callback', async () => {
      const msgs = [{ role: 'user' as const, content: 'Use fewer steps' }];
      const opts: RuntimeAgentSessionGenerateOptions = {
        onIterationComplete: vi.fn().mockResolvedValue({ continue: false, feedbackMessages: msgs }),
      };
      const result = await resolveRuntimeAgentSessionContinuation({
        options: opts,
        iteration: makeIteration(),
      });
      expect(result.feedbackMessages).toEqual(msgs);
    });
  });
});
