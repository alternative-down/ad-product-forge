import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import {
  computeCheckpointTimestamp,
  formatCheckpointPackageId,
  buildCheckpointPackageManifest,
  commitCheckpointPackage,
  cleanupTempPackage,
  prepareTempPackageDirectory,
  getTempPackagePath,
} from './agent-ltm-checkpoint-io-helpers';

// Track writeFile calls for writeCheckpointFiles tests via module-level capture
const writeFileCalls: [string, string][] = [];

vi.mock('node:fs/promises', () => ({
  default: Object.assign(
    vi.fn().mockImplementation((method) => {
      // no-op for mkdir, rm, rename
    }),
    {
      writeFile: vi.fn().mockImplementation(async (path: string, content: string) => {
        writeFileCalls.push([String(path), content]);
      }),
      mkdir: vi.fn().mockResolvedValue(undefined),
      rm: vi.fn().mockResolvedValue(undefined),
      rename: vi.fn().mockResolvedValue(undefined),
    },
  ),
}));

vi.mock('./agent-ltm-checkpoint-render', () => ({
  renderCheckpointPackageReadme: vi.fn().mockReturnValue('# README'),
  renderReflectionFile: vi.fn().mockReturnValue('## Reflection'),
  renderObservationFile: vi.fn().mockReturnValue('## Observation'),
}));

// Import writeCheckpointFiles separately so we can test with the mocked fs
import { writeCheckpointFiles } from './agent-ltm-checkpoint-io-helpers';

// Re-import fs to access mocked writeFile
import * as _fsModule from 'node:fs/promises';
const fsModule = _fsModule as any;

describe('computeCheckpointTimestamp', () => {
  it('returns earliest reflection createdAt when reflections exist', () => {
    const payload = {
      reflections: [
        { createdAt: 1700000000000, text: 'a' },
        { createdAt: 1710000000000, text: 'b' },
      ],
      observations: [],
      checkpointSummary: { updatedAt: 1720000000000, text: '' } as any,
      fromGeneration: 0,
      toGeneration: 1,
      threadId: 't1',
    } as any;
    expect(computeCheckpointTimestamp(payload)).toBe(1700000000000);
  });

  it('returns earliest observation createdAt when no reflections', () => {
    const payload = {
      reflections: [],
      observations: [{ createdAt: 1690000000000, text: 'o1' }],
      checkpointSummary: { updatedAt: 1720000000000, text: '' } as any,
      fromGeneration: 0,
      toGeneration: 1,
      threadId: 't1',
    } as any;
    expect(computeCheckpointTimestamp(payload)).toBe(1690000000000);
  });

  it('favors earliest across both arrays when both exist', () => {
    const payload = {
      reflections: [{ createdAt: 1700000000000, text: 'a' }],
      observations: [{ createdAt: 1680000000000, text: 'o1' }],
      checkpointSummary: { updatedAt: 1720000000000, text: '' } as any,
      fromGeneration: 0,
      toGeneration: 1,
      threadId: 't1',
    } as any;
    expect(computeCheckpointTimestamp(payload)).toBe(1680000000000);
  });

  it('falls back to checkpointSummary.updatedAt when no reflections or observations', () => {
    const payload = {
      reflections: [],
      observations: [],
      checkpointSummary: { updatedAt: 1750000000000, text: '' } as any,
      fromGeneration: 0,
      toGeneration: 1,
      threadId: 't1',
    } as any;
    expect(computeCheckpointTimestamp(payload)).toBe(1750000000000);
  });
});

describe('formatCheckpointPackageId', () => {
  it('zero-pads sequence to 3 digits', () => {
    expect(formatCheckpointPackageId('2025-01-15', 0)).toBe('2025-01-15_001');
    expect(formatCheckpointPackageId('2025-01-15', 7)).toBe('2025-01-15_008');
    expect(formatCheckpointPackageId('2025-01-15', 99)).toBe('2025-01-15_100');
  });
});

describe('writeCheckpointFiles', () => {
  beforeEach(() => {
    writeFileCalls.length = 0;
    vi.clearAllMocks();
  });

  it('writes README.md', async () => {
    const payload = {
      reflections: [],
      observations: [],
      checkpointSummary: { updatedAt: 1700000000000, text: '' } as any,
      fromGeneration: 0,
      toGeneration: 1,
      threadId: 't1',
    };

    await writeCheckpointFiles('/tmp/pkg', payload);

    const calledPaths = writeFileCalls.map(([p]) => p);
    expect(calledPaths.some((p) => p.endsWith('README.md'))).toBe(true);
  });

  it('writes reflection files with 3-digit zero-padded index', async () => {
    const payload = {
      reflections: [
        { createdAt: 1700000000000, text: 'ref1' },
        { createdAt: 1710000000000, text: 'ref2' },
      ],
      observations: [],
      checkpointSummary: { updatedAt: 1700000000000, text: '' } as any,
      fromGeneration: 0,
      toGeneration: 1,
      threadId: 't1',
    } as any;

    await writeCheckpointFiles('/tmp/pkg', payload);

    const calledPaths = writeFileCalls.map(([p]) => p);
    expect(calledPaths.some((p) => p.endsWith('reflection_001.md'))).toBe(true);
    expect(calledPaths.some((p) => p.endsWith('reflection_002.md'))).toBe(true);
  });

  it('writes observation files with 4-digit zero-padding', async () => {
    const payload = {
      reflections: [],
      observations: [
        { createdAt: 1700000000000, text: 'o1' },
        { createdAt: 1710000000000, text: 'o2' },
        { createdAt: 1720000000000, text: 'o3' },
      ],
      checkpointSummary: { updatedAt: 1700000000000, text: '' } as any,
      fromGeneration: 0,
      toGeneration: 1,
      threadId: 't1',
    } as any;

    await writeCheckpointFiles('/tmp/pkg', payload);

    const calledPaths = writeFileCalls.map(([p]) => p);
    expect(calledPaths.some((p) => p.endsWith('observation_0001.md'))).toBe(true);
    expect(calledPaths.some((p) => p.endsWith('observation_0003.md'))).toBe(true);
  });
});

describe('buildCheckpointPackageManifest', () => {
  it('sets checkpointGeneration from payload.toGeneration', () => {
    const manifest = buildCheckpointPackageManifest(
      '2025-01-15_001',
      {
        reflections: [],
        observations: [],
        checkpointSummary: { updatedAt: 1700000000000, text: '' } as any,
        fromGeneration: 10,
        toGeneration: 20,
        threadId: 't1',
      } as any,
      1700000000000,
    );

    expect(manifest.checkpointGeneration).toBe(20);
    expect(manifest.fromGeneration).toBe(10);
    expect(manifest.toGeneration).toBe(20);
  });

  it('uses checkpointTimestamp for createdAt and checkpointSummaryUpdatedAt', () => {
    const manifest = buildCheckpointPackageManifest(
      '2025-01-15_001',
      {
        reflections: [{ createdAt: 1680000000000, text: 'r' }],
        observations: [],
        checkpointSummary: { updatedAt: 1700000000000, text: '' } as any,
        fromGeneration: 0,
        toGeneration: 1,
        threadId: 't1',
      } as any,
      1680000000000,
    );

    expect(manifest.createdAt).toBe(1680000000000);
    expect(manifest.checkpointSummaryUpdatedAt).toBe(1680000000000);
  });

  it('counts reflections and observations', () => {
    const manifest = buildCheckpointPackageManifest(
      '2025-01-15_001',
      {
        reflections: [
          { createdAt: 1680000000000, text: 'a' },
          { createdAt: 1690000000000, text: 'b' },
        ],
        observations: [{ createdAt: 1670000000000, text: 'o' }],
        checkpointSummary: { updatedAt: 1700000000000, text: '' } as any,
        fromGeneration: 0,
        toGeneration: 1,
        threadId: 't1',
      } as any,
      1680000000000,
    );

    expect(manifest.reflectionCount).toBe(2);
    expect(manifest.observationCount).toBe(1);
  });
});

describe('commitCheckpointPackage', () => {
  it('removes old path then renames temp to final', async () => {
    await commitCheckpointPackage('/checkpoints/pkg', '/checkpoints/pkg.some-id.tmp');

    expect(fsModule.default.rm).toHaveBeenCalledWith('/checkpoints/pkg', {
      recursive: true,
      force: true,
    });
    expect(fsModule.default.rename).toHaveBeenCalledWith(
      '/checkpoints/pkg.some-id.tmp',
      '/checkpoints/pkg',
    );
  });
});

describe('cleanupTempPackage', () => {
  it('removes the temp directory', async () => {
    await cleanupTempPackage('/checkpoints/pkg.some-id.tmp');

    expect(fsModule.default.rm).toHaveBeenCalledWith('/checkpoints/pkg.some-id.tmp', {
      recursive: true,
      force: true,
    });
  });
});

describe('prepareTempPackageDirectory', () => {
  it('removes existing directory then creates fresh', async () => {
    await prepareTempPackageDirectory('/checkpoints/pkg.some-id.tmp');

    expect(fsModule.default.rm).toHaveBeenCalledWith('/checkpoints/pkg.some-id.tmp', {
      recursive: true,
      force: true,
    });
    expect(fsModule.default.mkdir).toHaveBeenCalledWith('/checkpoints/pkg.some-id.tmp', {
      recursive: true,
    });
  });
});

describe('getTempPackagePath', () => {
  it('appends .id.tmp suffix to packagePath', () => {
    const result = getTempPackagePath('/checkpoints/2025-01-15_001');
    expect(result).toMatch(/\.tmp$/);
    expect(result).toContain('/checkpoints/2025-01-15_001.');
    expect(result).not.toBe('/checkpoints/2025-01-15_001');
  });
});
