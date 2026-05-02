import { describe, expect, it } from 'vitest';
import type {
  CreateForgeAgentConfig,
  CreateAgentOptions,
  RuntimeWorkingMemory,
  RuntimeStepUsage,
  RuntimeGenerateStepResult,
  RuntimeIteration,
  RuntimeGenerateResult,
  RuntimeAgentGenerateMessage,
  RuntimeAgentGenerateOptions,
  RuntimeAgent,
  RuntimeWorkspaceFilesystem,
  RuntimeWorkspace,
  InternalAgentRuntime,
  RuntimeModelField,
  CreateForgeAgentConfigSchema,
} from './runtime/types';

// ── RuntimeWorkingMemory ──────────────────────────────────────────────────────

describe('RuntimeWorkingMemory', () => {
  it('is a structural interface with getWorkingMemory', () => {
    // Verify the shape exists — this is a type-level test
    const mem: RuntimeWorkingMemory = {
      getWorkingMemory: async ({ threadId, resourceId }) => {
        void threadId;
        void resourceId;
        return 'some memory content';
      },
    };
    expect(typeof mem.getWorkingMemory).toBe('function');
  });
});

// ── RuntimeStepUsage ──────────────────────────────────────────────────────────

describe('RuntimeStepUsage', () => {
  it('accepts partial usage fields', () => {
    const usage: RuntimeStepUsage = {};
    expect(usage.inputTokens).toBeUndefined();

    const withTokens: RuntimeStepUsage = {
      inputTokens: 100,
      outputTokens: 50,
      cachedInputTokens: 20,
    };
    expect(withTokens.inputTokens).toBe(100);
    expect(withTokens.cachedInputTokens).toBe(20);
  });

  it('accepts token detail breakdown', () => {
    const usage: RuntimeStepUsage = {
      inputTokenDetails: {
        noCacheTokens: 80,
        cacheReadTokens: 20,
      },
    };
    expect(usage.inputTokenDetails?.noCacheTokens).toBe(80);
    expect(usage.inputTokenDetails?.cacheReadTokens).toBe(20);
  });
});

// ── RuntimeGenerateStepResult ─────────────────────────────────────────────────

describe('RuntimeGenerateStepResult', () => {
  it('can be constructed with optional fields', () => {
    const result: RuntimeGenerateStepResult = {};
    expect(result.omTrace).toBeUndefined();
    expect(result.usage).toBeUndefined();
  });

  it('can include trace entries with phases', () => {
    const result: RuntimeGenerateStepResult = {
      omTrace: [
        { at: Date.now(), scope: 'memory', phase: 'observe', metrics: { tokens: 42 } },
        { at: Date.now(), scope: 'memory', phase: 'reflect', detail: { key: 'value' } },
      ],
    };
    expect(result.omTrace).toHaveLength(2);
    expect(result.omTrace![0].phase).toBe('observe');
    expect(result.omTrace![1].detail).toEqual({ key: 'value' });
  });

  it('can include usage data', () => {
    const result: RuntimeGenerateStepResult = {
      usage: { inputTokens: 100, outputTokens: 50 },
    };
    expect(result.usage?.inputTokens).toBe(100);
  });
});

// ── RuntimeIteration ───────────────────────────────────────────────────────────

describe('RuntimeIteration', () => {
  it('captures iteration data with tool calls and results', () => {
    const iteration: RuntimeIteration = {
      iteration: 1,
      text: 'I will help you',
      toolCalls: [
        { id: 'call-1', name: 'list_contacts', args: {} },
        { id: 'call-2', name: 'send_message', args: { targetKey: 'user-1', content: 'Hi' } },
      ],
      toolResults: [
        { id: 'call-1', name: 'list_contacts', result: [{ displayName: 'Alice' }] },
        { id: 'call-2', name: 'send_message', result: { sent: true } },
      ],
      isFinal: false,
      finishReason: 'tool-calls',
      runId: 'run-1',
      threadId: 'thread-1',
      resourceId: 'resource-1',
      agentId: 'agent-1',
      agentName: 'Test Agent',
      messages: [],
    };
    expect(iteration.iteration).toBe(1);
    expect(iteration.toolCalls).toHaveLength(2);
    expect(iteration.toolResults[1].result).toEqual({ sent: true });
  });

  it('marks final iteration correctly', () => {
    const final: RuntimeIteration = {
      iteration: 5,
      text: 'Done',
      toolCalls: [],
      toolResults: [],
      isFinal: true,
      finishReason: 'stop',
      runId: 'run-1',
      agentId: 'agent-1',
      agentName: 'Test Agent',
      messages: [],
    };
    expect(final.isFinal).toBe(true);
    expect(final.finishReason).toBe('stop');
  });
});

// ── RuntimeGenerateResult ─────────────────────────────────────────────────────

describe('RuntimeGenerateResult', () => {
  it('includes text and optional usage', () => {
    const result: RuntimeGenerateResult = {
      text: 'Hello, world!',
    };
    expect(result.text).toBe('Hello, world!');
    expect(result.usage).toBeUndefined();
  });

  it('can include steps with uiMessages', () => {
    const result: RuntimeGenerateResult = {
      text: 'Done',
      steps: [
        {
          response: {
            uiMessages: [{ parts: [{ type: 'text', text: 'Hello' }] }],
          },
        },
      ],
    };
    expect(result.steps).toHaveLength(1);
    expect(result.steps![0].response?.uiMessages?.[0].parts).toHaveLength(1);
  });
});

// ── RuntimeAgentGenerateMessage ──────────────────────────────────────────────

describe('RuntimeAgentGenerateMessage', () => {
  it('accepts string input', () => {
    const msg: RuntimeAgentGenerateMessage = 'Hello agent';
    expect(msg).toBe('Hello agent');
  });

  it('accepts structured role-based messages', () => {
    const msg: RuntimeAgentGenerateMessage = [
      { role: 'user', content: 'What is 2+2?' },
      { role: 'assistant', content: 'It is 4.' },
    ];
    expect(msg).toHaveLength(2);
    expect(msg[0].role).toBe('user');
    expect(msg[1].content).toBe('It is 4.');
  });
});

// ── RuntimeAgentGenerateOptions ────────────────────────────────────────────────

describe('RuntimeAgentGenerateOptions', () => {
  it('accepts partial options object', () => {
    const opts: RuntimeAgentGenerateOptions = {};
    expect(opts.runId).toBeUndefined();
  });

  it('accepts memory configuration', () => {
    const opts: RuntimeAgentGenerateOptions = {
      memory: {
        thread: 'thread-1',
        resource: 'resource-1',
        options: { lastMessages: 10 },
      },
    };
    expect(opts.memory?.thread).toBe('thread-1');
    expect(opts.memory?.options.lastMessages).toBe(10);
  });

  it('accepts callback options', () => {
    const opts: RuntimeAgentGenerateOptions = {
      onStepFinish: async (result) => {
        void result;
      },
      onIterationComplete: async (iteration) => {
        void iteration;
        return { continue: false };
      },
    };
    expect(typeof opts.onStepFinish).toBe('function');
    expect(typeof opts.onIterationComplete).toBe('function');
  });
});

// ── RuntimeAgent ──────────────────────────────────────────────────────────────

describe('RuntimeAgent', () => {
  it('defines generate and memory interface', () => {
    const agent: RuntimeAgent = {
      generate: async (prompt) => {
        void prompt;
        return { text: 'response' };
      },
      hasOwnMemory: () => true,
      getMemory: async () => null,
    };
    expect(typeof agent.generate).toBe('function');
    expect(typeof agent.hasOwnMemory).toBe('function');
    expect(typeof agent.getMemory).toBe('function');
  });
});

// ── RuntimeWorkspaceFilesystem ──────────────────────────────────────────────────

describe('RuntimeWorkspaceFilesystem', () => {
  it('defines filesystem interface', async () => {
    const fs: RuntimeWorkspaceFilesystem = {
      exists: async (path) => path === 'AGENT_CONTEXT.md',
      readFile: async (path) => {
        if (path === 'AGENT_CONTEXT.md') return 'context content';
        throw new Error('not found');
      },
    };
    const result = await fs.exists('AGENT_CONTEXT.md');
    expect(result).toBe(true);
    const content = await fs.readFile('AGENT_CONTEXT.md');
    expect(content).toBe('context content');
  });
});

// ── RuntimeWorkspace ───────────────────────────────────────────────────────────

describe('RuntimeWorkspace', () => {
  it('can have null filesystem', () => {
    const ws: RuntimeWorkspace = { filesystem: null };
    expect(ws.filesystem).toBeNull();
  });

  it('can have filesystem', async () => {
    const ws: RuntimeWorkspace = {
      filesystem: {
        exists: async () => false,
        readFile: async () => 'data',
      },
    };
    expect(ws.filesystem).not.toBeNull();
    expect(await ws.filesystem!.exists('x')).toBe(false);
  });
});

// ── RuntimeModelField ─────────────────────────────────────────────────────────

describe('RuntimeModelField', () => {
  it('is a union of CreateForgeAgentConfig field names', () => {
    const field: RuntimeModelField = 'instructions';
    expect(field).toBe('instructions');
  });

  it('accepts all documented field names', () => {
    const fields: RuntimeModelField[] = [
      'id',
      'instructions',
      'model',
      'pricingModelKey',
      'tools',
      'omModel',
      'omPricingModelKey',
      'checkpointedOmEnabled',
      'ltmRecallScoreThreshold',
      'workspaceFilesystem',
      'workspaceEmbedder',
    ];
    expect(fields).toHaveLength(11);
    fields.forEach((f) => expect(typeof f).toBe('string'));
  });
});

// ── CreateAgentOptions ─────────────────────────────────────────────────────────

describe('CreateAgentOptions', () => {
  it('can be empty', () => {
    const opts: CreateAgentOptions = {};
    expect(opts.longTermMemory).toBeUndefined();
    expect(opts.contractStore).toBeUndefined();
  });

  it('includes optional longTermMemory flag', () => {
    const opts: CreateAgentOptions = { longTermMemory: true };
    expect(opts.longTermMemory).toBe(true);
  });

  it('includes optional readRuntimeMemorySettings function', () => {
    const opts: CreateAgentOptions = {
      readRuntimeMemorySettings: async () => ({
        checkpointedOmTotalContextTokens: 100_000,
        checkpointedOmRecentRawTokens: 20_000,
        checkpointedOmRawObservationBatchTokens: 5_000,
        checkpointedOmObservationReflectionBatchTokens: 2_000,
        checkpointedOmObservationSupportTokens: 3_000,
        checkpointedOmReflectionSupportTokens: 2_000,
        ltmRecallSearchMode: 'hybrid',
        ltmRecallWorkspaceTopK: 5,
        ltmRecallGraphTopK: 5,
        ltmRecallGraphThreshold: 0.5,
        ltmRecallGraphRandomWalkSteps: 10,
        ltmRecallGraphIncludeSources: true,
        ltmRecallScoreThreshold: 0.7,
        ltmRecallDocumentCount: 5,
      }),
    };
    expect(typeof opts.readRuntimeMemorySettings).toBe('function');
  });
});

// ── CreateForgeAgentConfig ────────────────────────────────────────────────────

describe('CreateForgeAgentConfig', () => {
  it('accepts minimal config with required pricingModelKey', () => {
    const config: CreateForgeAgentConfig = {
      id: 'agent-1',
      name: 'Test',
      instructions: 'Be helpful',
      model: 'gpt-4o',
      pricingModelKey: 'gpt-4o',
    };
    expect(config.pricingModelKey).toBe('gpt-4o');
    expect(config.checkpointedOmEnabled).toBeUndefined();
  });

  it('accepts full config with all optional fields', () => {
    const config: CreateForgeAgentConfig = {
      id: 'agent-1',
      name: 'Test',
      instructions: 'Be helpful',
      model: 'gpt-4o',
      pricingModelKey: 'gpt-4o',
      omModel: 'gpt-4o-mini',
      omPricingModelKey: 'gpt-4o-mini',
      modelProfileId: 'profile-1',
      omModelProfileId: 'om-profile-1',
      companyName: 'Acme',
      companyContext: 'Testing',
      communicationDmFlushingEnabled: true,
      communicationGroupFlushingEnabled: false,
      memoryLastMessagesFullEnabled: false,
      memoryLastMessagesCount: 20,
      tokenCountFilterEnabled: true,
      tokenCountFilterLimit: 4096,
      checkpointedOmEnabled: true,
      checkpointedOmTotalContextTokens: 100_000,
      checkpointedOmRecentRawTokens: 20_000,
      checkpointedOmRawObservationBatchTokens: 5_000,
      checkpointedOmObservationReflectionBatchTokens: 2_000,
      checkpointedOmObservationSupportTokens: 3_000,
      checkpointedOmReflectionSupportTokens: 2_000,
      ltmRecallScoreThreshold: 0.7,
      ltmRecallDocumentCount: 5,
      roleName: 'Developer',
      roleDescription: 'Builds things',
    };
    expect(config.checkpointedOmEnabled).toBe(true);
    expect(config.ltmRecallScoreThreshold).toBe(0.7);
  });
});