import { describe, expect, it, vi, beforeEach } from 'vitest';
import { InMemoryForgeUsageSink, type ForgeStepUsageRecord } from './usage';

function makeRecord(overrides: Partial<ForgeStepUsageRecord> = {}): ForgeStepUsageRecord {
  return {
    runtimeId: 'runtime-1',
    stepId: 'step-1',
    stepNumber: 1,
    startedAt: '2024-01-01T00:00:00Z',
    finishedAt: '2024-01-01T00:00:01Z',
    usage: { inputTokens: 100, outputTokens: 50 },
    modelMetadata: { provider: 'anthropic', modelId: 'claude-3' },
    ...overrides,
  };
}

describe('InMemoryForgeUsageSink', () => {
  let sink: InMemoryForgeUsageSink;

  beforeEach(() => {
    sink = new InMemoryForgeUsageSink();
  });

  describe('recordStepUsage', () => {
    it('stores a single record', async () => {
      const record = makeRecord({ stepId: 'step-a' });
      await sink.recordStepUsage(record);
      expect(sink.list()).toEqual([record]);
    });

    it('stores multiple records', async () => {
      const r1 = makeRecord({ stepId: 'step-a', stepNumber: 1 });
      const r2 = makeRecord({ stepId: 'step-b', stepNumber: 2 });
      const r3 = makeRecord({ stepId: 'step-c', stepNumber: 3 });
      await sink.recordStepUsage(r1);
      await sink.recordStepUsage(r2);
      await sink.recordStepUsage(r3);
      expect(sink.list()).toHaveLength(3);
    });

    it('preserves order of recorded steps', async () => {
      const r1 = makeRecord({ stepId: 's1', stepNumber: 1 });
      const r2 = makeRecord({ stepId: 's2', stepNumber: 2 });
      await sink.recordStepUsage(r1);
      await sink.recordStepUsage(r2);
      expect(sink.list()[0].stepId).toBe('s1');
      expect(sink.list()[1].stepId).toBe('s2');
    });

    it('handles record with null usage', async () => {
      const record = makeRecord({ usage: null });
      await sink.recordStepUsage(record);
      expect(sink.list()[0].usage).toBeNull();
    });

    it('handles record with partial usage', async () => {
      const record = makeRecord({ usage: { inputTokens: 100 } });
      await sink.recordStepUsage(record);
      expect(sink.list()[0].usage).toEqual({ inputTokens: 100 });
    });

    it('handles record with null modelMetadata', async () => {
      const record = makeRecord({ modelMetadata: null });
      await sink.recordStepUsage(record);
      expect(sink.list()[0].modelMetadata).toBeNull();
    });

    it('stores records with different runtime IDs', async () => {
      const r1 = makeRecord({ runtimeId: 'runtime-A' });
      const r2 = makeRecord({ runtimeId: 'runtime-B' });
      await sink.recordStepUsage(r1);
      await sink.recordStepUsage(r2);
      expect(sink.list().map(r => r.runtimeId)).toEqual(['runtime-A', 'runtime-B']);
    });
  });

  describe('list', () => {
    it('returns empty array initially', () => {
      expect(sink.list()).toEqual([]);
    });

    it('returns a copy, not the internal array', async () => {
      const record = makeRecord();
      await sink.recordStepUsage(record);
      const list = sink.list();
      list.push(makeRecord({ stepId: 'mutated' }));
      expect(sink.list()).toHaveLength(1);
    });
  });
});