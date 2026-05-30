/**
 * Unit tests for agents/ltm/checkpoint-io.ts.
 *
 * Tests the pure/synchronous helpers: computeCheckpointTimestamp,
 * formatCheckpointPackageId, buildCheckpointPackageManifest, getTempPackagePath.
 * Async fs operations are tested via integration tests in ltm/store.test.ts.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  computeCheckpointTimestamp,
  formatCheckpointPackageId,
  buildCheckpointPackageManifest,
  getTempPackagePath,
} from './checkpoint-io';
import type { CheckpointedOmCheckpointPackageInput, CheckpointPackageManifest } from './store';

// ─── Test factories ─────────────────────────────────────────────────────────

function makeReflection(overrides: Partial<{ content: string; createdAt: number; generatedAt: number }> = {}) {
  return {
    content: 'reflection content',
    createdAt: 1_700_000_000_000,
    generatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

function makeObservation(overrides: Partial<{ content: string; createdAt: number; generatedAt: number }> = {}) {
  return {
    content: 'observation content',
    createdAt: 1_700_000_000_000,
    generatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

function makePayload(overrides: Partial<CheckpointedOmCheckpointPackageInput> = {}): CheckpointedOmCheckpointPackageInput {
  return {
    threadId: 'thread-001',
    checkpointSummary: { text: 'summary', updatedAt: 1_700_000_000_000 },
    reflections: [],
    observations: [],
    packageId: 'pkg-001',
    fromGeneration: 1,
    toGeneration: 10,
    ...overrides,
  } as CheckpointedOmCheckpointPackageInput;
}

// ─── computeCheckpointTimestamp ─────────────────────────────────────────────

describe('computeCheckpointTimestamp', () => {
  it('should return the earliest reflection.createdAt when reflections exist', () => {
    const payload = makePayload({
      reflections: [
        makeReflection({ createdAt: 1_700_000_100_000 }),
        makeReflection({ createdAt: 1_700_000_000_000 }),
        makeReflection({ createdAt: 1_700_000_200_000 }),
      ],
      observations: [],
    });
    const result = computeCheckpointTimestamp(payload);
    expect(result).toBe(1_700_000_000_000);
  });

  it('should return the earliest observation.createdAt when no reflections exist', () => {
    const payload = makePayload({
      reflections: [],
      observations: [
        makeObservation({ createdAt: 1_700_000_500_000 }),
        makeObservation({ createdAt: 1_700_000_300_000 }),
        makeObservation({ createdAt: 1_700_000_400_000 }),
      ],
    });
    const result = computeCheckpointTimestamp(payload);
    expect(result).toBe(1_700_000_300_000);
  });

  it('should prefer reflection.createdAt over observation.createdAt', () => {
    const payload = makePayload({
      reflections: [makeReflection({ createdAt: 1_700_000_100_000 })],
      observations: [makeObservation({ createdAt: 1_700_000_000_000 })],
    });
    const result = computeCheckpointTimestamp(payload);
    expect(result).toBe(1_700_000_000_000);
  });

  it('should fall back to generatedAt when createdAt is missing', () => {
    const payload = makePayload({
      reflections: [
        makeReflection({ createdAt: undefined as unknown as number, generatedAt: 1_700_000_000_000 }),
      ],
      observations: [],
    });
    const result = computeCheckpointTimestamp(payload);
    expect(result).toBe(1_700_000_000_000);
  });

  it('should use 0 as fallback when both createdAt and generatedAt are missing', () => {
    const payload = makePayload({
      reflections: [
        makeReflection({ createdAt: undefined as unknown as number, generatedAt: undefined as unknown as number }),
      ],
      observations: [],
    });
    const result = computeCheckpointTimestamp(payload);
    expect(result).toBe(0);
  });

  it('should return checkpointSummary.updatedAt when no reflections or observations', () => {
    const payload = makePayload({
      reflections: [],
      observations: [],
      checkpointSummary: { text: 'empty', updatedAt: 1_700_000_000_000 },
    });
    const result = computeCheckpointTimestamp(payload);
    expect(result).toBe(1_700_000_000_000);
  });

  it('should handle reflections with mixed createdAt and generatedAt', () => {
    const payload = makePayload({
      reflections: [
        makeReflection({ createdAt: 1_700_000_200_000 }),
        makeReflection({ createdAt: undefined as unknown as number, generatedAt: 1_700_000_000_000 }),
        makeReflection({ createdAt: 1_700_000_300_000 }),
      ],
      observations: [],
    });
    const result = computeCheckpointTimestamp(payload);
    expect(result).toBe(1_700_000_000_000);
  });

  it('should handle numeric and string timestamps in createdAt', () => {
    const payload = makePayload({
      reflections: [
        { content: 'test', createdAt: '1700000000000' as unknown as number, generatedAt: 1_700_000_000_000 },
        makeReflection({ createdAt: Number('1700000000000') }),
      ],
      observations: [],
    });
    const result = computeCheckpointTimestamp(payload);
    expect(result).toBe(1_700_000_000_000);
  });
});

// ─── formatCheckpointPackageId ───────────────────────────────────────────────

describe('formatCheckpointPackageId', () => {
  it('should format with zero-padded count', () => {
    expect(formatCheckpointPackageId('2025-01-15', 0)).toBe('2025-01-15_001');
    expect(formatCheckpointPackageId('2025-01-15', 1)).toBe('2025-01-15_002');
    expect(formatCheckpointPackageId('2025-01-15', 9)).toBe('2025-01-15_010');
  });

  it('should pad to 3 digits', () => {
    expect(formatCheckpointPackageId('2025-01-15', 99)).toBe('2025-01-15_100');
    expect(formatCheckpointPackageId('2025-01-15', 999)).toBe('2025-01-15_1000');
  });

  it('should handle empty day key', () => {
    expect(formatCheckpointPackageId('', 0)).toBe('_001');
  });

  it('should handle day keys with hyphens and underscores', () => {
    expect(formatCheckpointPackageId('2025_01_15', 0)).toBe('2025_01_15_001');
    expect(formatCheckpointPackageId('2025-01-15', 0)).toBe('2025-01-15_001');
  });
});

// ─── buildCheckpointPackageManifest ─────────────────────────────────────────

describe('buildCheckpointPackageManifest', () => {
  it('should build manifest with all fields correctly mapped', () => {
    const payload = makePayload({ fromGeneration: 5, toGeneration: 15 });
    const result = buildCheckpointPackageManifest('pkg-001', payload, 1_700_000_000_000);

    expect(result.packageId).toBe('pkg-001');
    expect(result.checkpointGeneration).toBe(15);
    expect(result.fromGeneration).toBe(5);
    expect(result.toGeneration).toBe(15);
    expect(result.createdAt).toBe('1700000000000');
    expect(result.checkpointSummaryUpdatedAt).toBe('1700000000000');
    expect(result.reflectionCount).toBe(0);
    expect(result.observationCount).toBe(0);
  });

  it('should handle null fromGeneration', () => {
    const payload = makePayload({ fromGeneration: null as unknown as undefined, toGeneration: 10 });
    const result = buildCheckpointPackageManifest('pkg-002', payload, 1_700_000_000_000);

    expect(result.fromGeneration).toBeNull();
  });

  it('should set reflectionCount and observationCount from payload', () => {
    const payload = makePayload({
      reflections: [
        makeReflection(),
        makeReflection(),
        makeReflection(),
      ],
      observations: [
        makeObservation(),
        makeObservation(),
      ],
    });
    const result = buildCheckpointPackageManifest('pkg-003', payload, 0);

    expect(result.reflectionCount).toBe(3);
    expect(result.observationCount).toBe(2);
  });

  it('should use checkpointTimestamp in createdAt', () => {
    const payload = makePayload({ toGeneration: 20 });
    const ts = 1_750_000_000_000;
    const result = buildCheckpointPackageManifest('pkg-004', payload, ts);

    expect(result.createdAt).toBe('1750000000000');
    expect(result.checkpointSummaryUpdatedAt).toBe('1750000000000');
  });
});

// ─── getTempPackagePath ─────────────────────────────────────────────────────

describe('getTempPackagePath', () => {
  it('should append .<id>.tmp to the package path', () => {
    const result = getTempPackagePath('/data/checkpoints/pkg-001');
    expect(result).toMatch(/^\/data\/checkpoints\/pkg-001\.[a-z0-9-]+\.tmp$/);
  });

  it('should return different IDs for successive calls', () => {
    const r1 = getTempPackagePath('/data/checkpoints/pkg-001');
    const r2 = getTempPackagePath('/data/checkpoints/pkg-001');
    expect(r1).not.toBe(r2);
  });

  it('should handle paths with multiple dots', () => {
    const result = getTempPackagePath('/data/checkpoints/pkg.v2.001');
    expect(result).toMatch(/\.tmp$/);
    expect(result).toContain('/data/checkpoints/pkg.v2.001.');
  });
});