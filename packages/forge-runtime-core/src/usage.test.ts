import { describe, expect, it } from 'vitest';
import { InMemoryForgeUsageSink, createForgeUsageObserver } from './usage.js';

describe('usage', () => {
  describe('ForgeStepModelUsage', () => {
    it('accepts usage with all optional fields', () => {
      const usage = {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cachedInputTokens: 30,
        reasoningTokens: 20,
      };
      expect(usage.inputTokens).toBe(100);
    });

    it('accepts partial usage', () => {
      const usage = { inputTokens: 50 };
      expect(usage.inputTokens).toBe(50);
    });
  });

  describe('InMemoryForgeUsageSink', () => {
    it('records step usage', async () => {
      const sink = new InMemoryForgeUsageSink();
      await sink.recordStepUsage({
        runtimeId: 'runtime-1',
        stepId: 'step-1',
        stepNumber: 1,
        startedAt: '2024-01-01T00:00:00Z',
        finishedAt: '2024-01-01T00:00:01Z',
        usage: { inputTokens: 100, outputTokens: 50 },
        modelMetadata: { provider: 'openai', modelId: 'gpt-5.4' },
      });
      const records = sink.list();
      expect(records).toHaveLength(1);
      expect(records[0].runtimeId).toBe('runtime-1');
      expect(records[0].usage?.inputTokens).toBe(100);
    });

    it('records multiple usages', async () => {
      const sink = new InMemoryForgeUsageSink();
      await sink.recordStepUsage({
        runtimeId: 'runtime-1',
        stepId: 'step-1',
        stepNumber: 1,
        startedAt: '2024-01-01T00:00:00Z',
        finishedAt: '2024-01-01T00:00:01Z',
        usage: { inputTokens: 100 },
        modelMetadata: null,
      });
      await sink.recordStepUsage({
        runtimeId: 'runtime-1',
        stepId: 'step-2',
        stepNumber: 2,
        startedAt: '2024-01-01T00:00:01Z',
        finishedAt: '2024-01-01T00:00:02Z',
        usage: { outputTokens: 200 },
        modelMetadata: null,
      });
      expect(sink.list()).toHaveLength(2);
    });

    it('returns a copy of records', () => {
      const sink = new InMemoryForgeUsageSink();
      const list1 = sink.list();
      const list2 = sink.list();
      expect(list1).not.toBe(list2);
      expect(list1).toEqual(list2);
    });

    it('handles null usage', async () => {
      const sink = new InMemoryForgeUsageSink();
      await sink.recordStepUsage({
        runtimeId: 'runtime-1',
        stepId: 'step-1',
        stepNumber: 1,
        startedAt: '2024-01-01T00:00:00Z',
        finishedAt: '2024-01-01T00:00:01Z',
        usage: null,
        modelMetadata: null,
      });
      expect(sink.list()[0].usage).toBeNull();
    });
  });

  describe('createForgeUsageObserver', () => {
    it('creates an observer with correct name', () => {
      const sink = new InMemoryForgeUsageSink();
      const observer = createForgeUsageObserver(sink);
      expect(observer.name).toBe('forge-usage-observer');
    });

    it('observer has onAfterStep handler', () => {
      const sink = new InMemoryForgeUsageSink();
      const observer = createForgeUsageObserver(sink);
      expect(typeof observer.onAfterStep).toBe('function');
    });
  });
});
