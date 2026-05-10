/**
 * Integration tests for agent-runtime-core message queue behavior.
 *
 * Tests cover:
 * - Queue depth management (pendingInputs accumulation)
 * - Backpressure handling (inputBatching limit enforcement)
 * - Throughput under various load conditions
 * - Batching strategy behavior (consume-all vs fixed-size)
 * - Snapshot reflects queue state correctly
 *
 * Scope: packages/agent-runtime-core/src/core/runtime.ts
 * Issue: #1920
 */
import { describe, expect, it } from 'vitest';

import { AgentRuntime } from '../core/runtime.js';
import { createFixedSizeInputBatchingStrategy } from '../core/input-batching.js';
import { FakeStepModelAdapter } from '../integrations/testing/fake-model.js';
import type { StepModelRequest } from '../core/types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

const IMMEDIATE_MODEL = new FakeStepModelAdapter(() => ({
  segments: [{ kind: 'message', text: 'ok' }],
  actionRequests: [],
  continuation: 'stop',
}));

function slowModel(delayMs: number) {
  return new FakeStepModelAdapter(async () => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return {
      segments: [{ kind: 'message', text: 'ok' }],
      actionRequests: [],
      continuation: 'stop',
    };
  });
}

function makeRuntime(overrides?: Partial<ConstructorParameters<typeof AgentRuntime>[0]>) {
  return new AgentRuntime({
    runtimeId: 'queue-test',
    model: IMMEDIATE_MODEL,
    ...overrides,
  });
}

// ─── Queue depth management ─────────────────────────────────────────────────

describe('message queue — queue depth management', () => {
  it('accumulates pending inputs when step() is not called', async () => {
    const runtime = makeRuntime();
    runtime.dispatch({ id: 'q1', type: 'event', payload: { text: 'a' } });
    runtime.dispatch({ id: 'q2', type: 'event', payload: { text: 'b' } });
    runtime.dispatch({ id: 'q3', type: 'event', payload: { text: 'c' } });

    // No step() yet — queue should hold inputs
    const result = await runtime.step();
    expect(result).not.toBeNull();
    expect(result!.record.inputs).toHaveLength(3);
  });

  it('drains all pending inputs in a single step when batching is consume-all', async () => {
    const runtime = makeRuntime();
    for (let i = 0; i < 5; i++) {
      runtime.dispatch({ id: `q-${i}`, type: 'event', payload: { text: `msg ${i}` } });
    }

    const result = await runtime.step();
    expect(result?.record.inputs).toHaveLength(5);
  });

  it('reports correct pending inputs depth after a step', async () => {
    const runtime = makeRuntime();
    for (let i = 0; i < 10; i++) {
      runtime.dispatch({ id: `q-${i}`, type: 'event', payload: { text: `msg ${i}` } });
    }

    const result1 = await runtime.step();
    // With consume-all batching, all 10 inputs are consumed in one step
    expect(result1?.snapshot.pendingInputs.length).toBe(0);

    // Add more — queue depth should increase
    for (let i = 0; i < 5; i++) {
      runtime.dispatch({ id: `q2-${i}`, type: 'event', payload: { text: `msg ${i}` } });
    }
    const result2 = await runtime.step();
    expect(result2?.snapshot.pendingInputs.length).toBe(0);
  });

  it('queue depth grows with multiple dispatches between steps', async () => {
    const runtime = makeRuntime();

    // Queue 1 item
    runtime.dispatch({ id: 'dq-1', type: 'event', payload: { text: '1' } });
    let result = await runtime.step();
    expect(result?.snapshot.pendingInputs.length).toBe(0);

    // Queue 3 items in quick succession
    runtime.dispatch({ id: 'dq-2a', type: 'event', payload: { text: '2a' } });
    runtime.dispatch({ id: 'dq-2b', type: 'event', payload: { text: '2b' } });
    runtime.dispatch({ id: 'dq-2c', type: 'event', payload: { text: '2c' } });

    // Drain — all 3 should be in one step (consume-all default)
    result = await runtime.step();
    expect(result?.record.inputs).toHaveLength(3);
  });

  it('snapshot reflects current queue depth before step processes them', async () => {
    const runtime = makeRuntime();
    runtime.dispatch({ id: 'snap-a', type: 'event', payload: { text: 'a' } });
    runtime.dispatch({ id: 'snap-b', type: 'event', payload: { text: 'b' } });

    const result = await runtime.step();
    expect(result).not.toBeNull();
    // Snapshot is taken AFTER inputs are consumed — queue should be 0
    expect(result!.snapshot.pendingInputs).toHaveLength(0);
  });
});

// ─── Backpressure / input batching ─────────────────────────────────────────────

describe('message queue — backpressure and input batching', () => {
  it('limits inputs per step with fixed-size batching strategy', async () => {
    const batchSize = 3;
    const runtime = new AgentRuntime({
      runtimeId: 'batching-test',
      model: IMMEDIATE_MODEL,
      inputBatching: createFixedSizeInputBatchingStrategy(batchSize),
    });

    for (let i = 0; i < 10; i++) {
      runtime.dispatch({ id: `batch-${i}`, type: 'event', payload: { text: `msg ${i}` } });
    }

    const result = await runtime.step();
    expect(result?.record.inputs).toHaveLength(batchSize);
    expect(result?.snapshot.pendingInputs.length).toBeGreaterThan(0);
  });

  it('remaining inputs are processed in subsequent step() calls', async () => {
    const batchSize = 2;
    const runtime = new AgentRuntime({
      runtimeId: 'batch-drain-test',
      model: IMMEDIATE_MODEL,
      inputBatching: createFixedSizeInputBatchingStrategy(batchSize),
    });

    for (let i = 0; i < 6; i++) {
      runtime.dispatch({ id: `drain-${i}`, type: 'event', payload: { text: `msg ${i}` } });
    }

    const result1 = await runtime.step();
    expect(result1?.record.inputs).toHaveLength(2);

    const result2 = await runtime.step();
    expect(result2?.record.inputs).toHaveLength(2);

    const result3 = await runtime.step();
    expect(result3?.record.inputs).toHaveLength(2);

    const result4 = await runtime.step();
    // Queue is empty — runtime returns null
    expect(result4?.record.inputs ?? null).toBeNull();
  });

  it('consume-all strategy processes all queued inputs regardless of count', async () => {
    const runtime = makeRuntime();

    for (let i = 0; i < 100; i++) {
      runtime.dispatch({ id: `large-${i}`, type: 'event', payload: { text: `msg ${i}` } });
    }

    const result = await runtime.step();
    expect(result?.record.inputs).toHaveLength(100);
    expect(result?.snapshot.pendingInputs.length).toBe(0);
  });

  it('snapshot pendingInputs length reflects queue after partial drain', async () => {
    const batchSize = 4;
    const runtime = new AgentRuntime({
      runtimeId: 'remain-test',
      model: IMMEDIATE_MODEL,
      inputBatching: createFixedSizeInputBatchingStrategy(batchSize),
    });

    for (let i = 0; i < 9; i++) {
      runtime.dispatch({ id: `rem-${i}`, type: 'event', payload: { text: `msg ${i}` } });
    }

    const result = await runtime.step();
    expect(result?.record.inputs).toHaveLength(4);
    expect(result?.snapshot.pendingInputs.length).toBe(5);
  });
});

// ─── Throughput under load ──────────────────────────────────────────────────

describe('message queue — throughput under load', () => {
  it('processes many queued inputs in a single step efficiently', async () => {
    const runtime = makeRuntime();
    const count = 50;
    for (let i = 0; i < count; i++) {
      runtime.dispatch({ id: `tput-${i}`, type: 'event', payload: { text: `msg ${i}` } });
    }

    const start = Date.now();
    const result = await runtime.step();
    const elapsed = Date.now() - start;

    expect(result?.record.inputs).toHaveLength(count);
    // Should complete in reasonable time even with many inputs
    expect(elapsed).toBeLessThan(2000);
  });

  it('throughput does not degrade with moderate fixed-size batches', async () => {
    const batchSize = 10;
    const runtime = new AgentRuntime({
      runtimeId: 'tput-batched',
      model: IMMEDIATE_MODEL,
      inputBatching: createFixedSizeInputBatchingStrategy(batchSize),
    });

    for (let i = 0; i < 100; i++) {
      runtime.dispatch({ id: `tput-b-${i}`, type: 'event', payload: { text: `msg ${i}` } });
    }

    const start = Date.now();
    const results = [];
    let result = await runtime.step();
    while (result && result.record.inputs.length > 0) {
      results.push(result.record);
      result = await runtime.step();
    }
    const elapsed = Date.now() - start;

    const totalInputs = results.reduce((sum, r) => sum + r.inputs.length, 0);
    expect(totalInputs).toBe(100);
    expect(results).toHaveLength(10);
    expect(elapsed).toBeLessThan(2000);
  });

  it('sustained throughput over multiple sequential batches', async () => {
    const batchSize = 5;
    const runtime = new AgentRuntime({
      runtimeId: 'sustained-throughput',
      model: IMMEDIATE_MODEL,
      inputBatching: createFixedSizeInputBatchingStrategy(batchSize),
    });

    const totalBatches = 20;
    const totalInputs = totalBatches * batchSize;

    for (let batch = 0; batch < totalBatches; batch++) {
      for (let i = 0; i < batchSize; i++) {
        runtime.dispatch({
          id: `sust-${batch}-${i}`,
          type: 'event',
          payload: { text: `batch ${batch} msg ${i}` },
        });
      }
      await runtime.step();
    }

    // All batches processed, queue should be empty
    const final = await runtime.step();
    expect(final?.record.inputs ?? null).toBeNull();
    expect(final?.snapshot?.pendingInputs?.length ?? 0).toBe(0);
  });

  it('concurrent dispatches accumulate before first step', async () => {
    const runtime = makeRuntime();
    const count = 20;

    await Promise.all(
      Array.from({ length: count }, (_, i) =>
        runtime.dispatch({ id: `conc-${i}`, type: 'event', payload: { text: `msg ${i}` } }),
      ),
    );

    const result = await runtime.step();
    expect(result?.record.inputs).toHaveLength(count);
  });

  it('slow model increases per-step latency but inputs accumulate correctly', async () => {
    const runtime = new AgentRuntime({
      runtimeId: 'slow-model-queue',
      model: slowModel(20),
    });

    for (let i = 0; i < 5; i++) {
      runtime.dispatch({ id: `slow-${i}`, type: 'event', payload: { text: `msg ${i}` } });
    }

    const start = Date.now();
    const result = await runtime.step();
    const elapsed = Date.now() - start;

    expect(result?.record.inputs).toHaveLength(5);
    expect(elapsed).toBeGreaterThanOrEqual(20);
    expect(elapsed).toBeLessThan(500); // sanity: no unbounded delay
  });
});

// ─── Snapshot and restore ───────────────────────────────────────────────────

describe('message queue — snapshot and restore', () => {
  it('queue is empty after consume-all step drains all inputs', async () => {
    const runtime = makeRuntime();
    runtime.dispatch({ id: 'snap-a', type: 'event', payload: { text: 'a' } });
    runtime.dispatch({ id: 'snap-b', type: 'event', payload: { text: 'b' } });

    const result = await runtime.step();
    expect(result).not.toBeNull();
    // Snapshot taken AFTER draining — queue is empty
    expect(result!.snapshot.pendingInputs).toHaveLength(0);
  });

  it('pending inputs are preserved in snapshot after partial batch drain', async () => {
    const batchSize = 3;
    const runtime = new AgentRuntime({
      runtimeId: 'snap-batch',
      model: IMMEDIATE_MODEL,
      inputBatching: createFixedSizeInputBatchingStrategy(batchSize),
    });

    for (let i = 0; i < 8; i++) {
      runtime.dispatch({ id: `snap-batch-${i}`, type: 'event', payload: { text: `msg ${i}` } });
    }

    const result = await runtime.step();
    // Only 3 consumed, 5 remain
    expect(result!.record.inputs).toHaveLength(batchSize);
    const pending = result!.snapshot.pendingInputs;
    expect(pending).toHaveLength(5);
    expect(pending[0].id).toBe('snap-batch-3');
  });
});