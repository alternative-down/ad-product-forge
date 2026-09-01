import { describe, expect, it } from 'vitest';
import { runtimeSnapshotSchema } from '../snapshot-schema.js';

describe('runtimeSnapshotSchema', () => {
  it('parses a valid snapshot', () => {
    const valid = {
      runtimeId: 'agent-1',
      status: 'idle',
      pendingInputs: [],
      lastActionResults: [],
      steps: [],
    };
    const result = runtimeSnapshotSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects empty runtimeId', () => {
    const result = runtimeSnapshotSchema.safeParse({
      runtimeId: '',
      status: 'idle',
      pendingInputs: [],
      lastActionResults: [],
      steps: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid status', () => {
    const result = runtimeSnapshotSchema.safeParse({
      runtimeId: 'agent-1',
      status: 'stopped',
      pendingInputs: [],
      lastActionResults: [],
      steps: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects step with non-positive stepNumber', () => {
    const result = runtimeSnapshotSchema.safeParse({
      runtimeId: 'agent-1',
      status: 'idle',
      pendingInputs: [],
      lastActionResults: [],
      steps: [
        {
          id: 'step-1',
          stepNumber: 0,
          inputs: [],
          context: [],
          modelResponse: { segments: [], actionRequests: [], continuation: 'stop' },
          modelUsage: null,
          modelMetadata: null,
          actionResults: [],
          continuation: 'stop',
          startedAt: '2026-01-01T00:00:00Z',
          finishedAt: '2026-01-01T00:00:01Z',
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects step with missing startedAt', () => {
    const result = runtimeSnapshotSchema.safeParse({
      runtimeId: 'agent-1',
      status: 'idle',
      pendingInputs: [],
      lastActionResults: [],
      steps: [
        {
          id: 'step-1',
          stepNumber: 1,
          inputs: [],
          context: [],
          modelResponse: { segments: [], actionRequests: [], continuation: 'stop' },
          modelUsage: null,
          modelMetadata: null,
          actionResults: [],
          continuation: 'stop',
          startedAt: '',
          finishedAt: '2026-01-01T00:00:01Z',
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects actionResult with missing name', () => {
    const result = runtimeSnapshotSchema.safeParse({
      runtimeId: 'agent-1',
      status: 'idle',
      pendingInputs: [],
      lastActionResults: [{ name: '', input: {}, output: null }],
      steps: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects step with invalid continuation value', () => {
    const result = runtimeSnapshotSchema.safeParse({
      runtimeId: 'agent-1',
      status: 'idle',
      pendingInputs: [],
      lastActionResults: [],
      steps: [
        {
          id: 'step-1',
          stepNumber: 1,
          inputs: [],
          context: [],
          modelResponse: { segments: [], actionRequests: [], continuation: 'pause' },
          modelUsage: null,
          modelMetadata: null,
          actionResults: [],
          continuation: 'pause',
          startedAt: '2026-01-01T00:00:00Z',
          finishedAt: '2026-01-01T00:00:01Z',
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
