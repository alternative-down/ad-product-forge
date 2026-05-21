/**
 * Concurrent Execution Benchmarks — #2044
 *
 * Benchmark tests measuring concurrent agent execution throughput,
 * response latency under load, and memory usage during parallel operations.
 *
 * Uses Vitest's built-in bench API (TinyBench).
 * Run with: npx vitest bench
 */
import { bench, describe } from 'vitest';
import { AgentRuntime } from '../../core/runtime.js';
import { FakeStepModelAdapter } from '../../integrations/testing/fake-model.js';
import type { StepModelRequest } from '../../core/types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeFastModel(delayMs = 0) {
  return new FakeStepModelAdapter(async (_req: StepModelRequest) => {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return {
      segments: [{ kind: 'message', text: 'ok' }],
      actionRequests: [],
      continuation: 'stop',
    };
  });
}

function makeSlowModel(delayMs = 50) {
  return new FakeStepModelAdapter(async (_req: StepModelRequest) => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return {
      segments: [{ kind: 'message', text: 'processed' }],
      actionRequests: [],
      continuation: 'stop',
    };
  });
}

// ─── Baseline — single runtime ───────────────────────────────────────────

describe('single runtime, single dispatch', () => {
  bench('single step', async () => {
    const runtime = new AgentRuntime({ runtimeId: 'bench-single', model: makeFastModel() });
    runtime.dispatch({ id: 'input-1', type: 'event', payload: { text: 'hello' } });
    await runtime.step();
  });

  bench('5 sequential steps', async () => {
    const runtime = new AgentRuntime({ runtimeId: 'bench-seq5', model: makeFastModel() });
    for (let i = 0; i < 5; i++) {
      runtime.dispatch({ id: `input-${i}`, type: 'event', payload: { text: `msg ${i}` } });
      await runtime.step();
    }
  });
});

// ─── Concurrent step execution ─────────────────────────────────────────────

describe('concurrent step execution', () => {
  bench('2 parallel step() calls', async () => {
    const runtime = new AgentRuntime({ runtimeId: 'bench-concurrent-2', model: makeFastModel() });
    runtime.dispatch({ id: 'input-1', type: 'event', payload: { text: 'a' } });
    runtime.dispatch({ id: 'input-2', type: 'event', payload: { text: 'b' } });
    await Promise.all([runtime.step(), runtime.step()]);
  });

  bench('4 parallel step() calls', async () => {
    const runtime = new AgentRuntime({ runtimeId: 'bench-concurrent-4', model: makeFastModel() });
    for (let i = 0; i < 4; i++) {
      runtime.dispatch({ id: `input-${i}`, type: 'event', payload: { text: `msg ${i}` } });
    }
    await Promise.all([runtime.step(), runtime.step(), runtime.step(), runtime.step()]);
  });

  bench('8 parallel step() calls', async () => {
    const runtime = new AgentRuntime({ runtimeId: 'bench-concurrent-8', model: makeFastModel() });
    for (let i = 0; i < 8; i++) {
      runtime.dispatch({ id: `input-${i}`, type: 'event', payload: { text: `msg ${i}` } });
    }
    await Promise.all([
      runtime.step(),
      runtime.step(),
      runtime.step(),
      runtime.step(),
      runtime.step(),
      runtime.step(),
      runtime.step(),
      runtime.step(),
    ]);
  });
});

// ─── Multiple runtimes, shared model ───────────────────────────────────────

describe('multiple runtimes, shared model', () => {
  bench('2 concurrent runtimes', async () => {
    const sharedModel = makeFastModel();
    const [runtime1, runtime2] = [
      new AgentRuntime({ runtimeId: 'bench-r1', model: sharedModel }),
      new AgentRuntime({ runtimeId: 'bench-r2', model: sharedModel }),
    ];
    runtime1.dispatch({ id: 'r1-i1', type: 'event', payload: { text: 'r1' } });
    runtime2.dispatch({ id: 'r2-i1', type: 'event', payload: { text: 'r2' } });
    await Promise.all([runtime1.step(), runtime2.step()]);
  });

  bench('4 concurrent runtimes', async () => {
    const sharedModel = makeFastModel();
    const runtimes = Array.from(
      { length: 4 },
      (_, i) => new AgentRuntime({ runtimeId: `bench-r${i}`, model: sharedModel }),
    );
    runtimes.forEach((runtime, i) => {
      runtime.dispatch({ id: `r${i}-i1`, type: 'event', payload: { text: `msg ${i}` } });
    });
    await Promise.all(runtimes.map((runtime) => runtime.step()));
  });

  bench('8 concurrent runtimes', async () => {
    const sharedModel = makeFastModel();
    const runtimes = Array.from(
      { length: 8 },
      (_, i) => new AgentRuntime({ runtimeId: `bench-r${i}`, model: sharedModel }),
    );
    runtimes.forEach((runtime, i) => {
      runtime.dispatch({ id: `r${i}-i1`, type: 'event', payload: { text: `msg ${i}` } });
    });
    await Promise.all(runtimes.map((runtime) => runtime.step()));
  });
});

// ─── Latency under load ─────────────────────────────────────────────────────

describe('latency under load — slow model', () => {
  bench('1 runtime with 10ms model delay', async () => {
    const runtime = new AgentRuntime({ runtimeId: 'bench-lat1', model: makeSlowModel(10) });
    runtime.dispatch({ id: 'l1-i1', type: 'event', payload: { text: 'hello' } });
    await runtime.step();
  });

  bench('2 parallel runtimes with 10ms model delay each', async () => {
    const sharedModel = makeSlowModel(10);
    const [r1, r2] = [
      new AgentRuntime({ runtimeId: 'bench-lat2-r1', model: sharedModel }),
      new AgentRuntime({ runtimeId: 'bench-lat2-r2', model: sharedModel }),
    ];
    r1.dispatch({ id: 'lat2-r1-i1', type: 'event', payload: { text: 'a' } });
    r2.dispatch({ id: 'lat2-r2-i1', type: 'event', payload: { text: 'b' } });
    await Promise.all([r1.step(), r2.step()]);
  });

  bench('4 parallel runtimes with 10ms model delay each', async () => {
    const sharedModel = makeSlowModel(10);
    const runtimes = Array.from(
      { length: 4 },
      (_, i) => new AgentRuntime({ runtimeId: `bench-lat4-r${i}`, model: sharedModel }),
    );
    runtimes.forEach((runtime, i) => {
      runtime.dispatch({ id: `lat4-r${i}-i1`, type: 'event', payload: { text: `msg ${i}` } });
    });
    await Promise.all(runtimes.map((runtime) => runtime.step()));
  });
});

// ─── Memory baseline ───────────────────────────────────────────────────────

describe('memory baseline — concurrent runtimes', () => {
  bench('create and step 1 runtime', async () => {
    const runtime = new AgentRuntime({ runtimeId: 'bench-mem-1', model: makeFastModel() });
    runtime.dispatch({ id: 'mem1-i1', type: 'event', payload: { text: 'hello' } });
    await runtime.step();
  });

  bench('create and step 4 runtimes concurrently', async () => {
    const runtimes = Array.from(
      { length: 4 },
      (_, i) => new AgentRuntime({ runtimeId: `bench-mem4-r${i}`, model: makeFastModel() }),
    );
    runtimes.forEach((runtime, i) => {
      runtime.dispatch({ id: `mem4-r${i}-i1`, type: 'event', payload: { text: `msg ${i}` } });
    });
    await Promise.all(runtimes.map((runtime) => runtime.step()));
  });

  bench('create and step 8 runtimes concurrently', async () => {
    const runtimes = Array.from(
      { length: 8 },
      (_, i) => new AgentRuntime({ runtimeId: `bench-mem8-r${i}`, model: makeFastModel() }),
    );
    runtimes.forEach((runtime, i) => {
      runtime.dispatch({ id: `mem8-r${i}-i1`, type: 'event', payload: { text: `msg ${i}` } });
    });
    await Promise.all(runtimes.map((runtime) => runtime.step()));
  });
});
