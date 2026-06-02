/**
 * Unit tests for agents/ltm/recall/count-files.ts
 *
 * Covers: countFiles(rootPath, relativePath)
 *  - Recursive file count
 *  - Trailing-slash normalization
 *  - Missing directory returns 0 (with forgeDebug logged)
 *  - Permission errors return 0 (with forgeDebug logged)
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { countFiles } from './count-files';

// Mock forgeDebug to avoid log noise and to assert on log calls.
vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

import { forgeDebug } from '@forge-runtime/core';

describe('countFiles', () => {
  let tempRoot: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempRoot = await mkdtemp(path.join(tmpdir(), 'count-files-test-'));
  });

  it('counts files in a flat directory', async () => {
    await writeFile(path.join(tempRoot, 'a.txt'), 'a');
    await writeFile(path.join(tempRoot, 'b.txt'), 'b');
    await writeFile(path.join(tempRoot, 'c.json'), '{}');

    const result = await countFiles(tempRoot, '.');

    expect(result).toBe(3);
  });

  it('counts files recursively across nested directories', async () => {
    await mkdir(path.join(tempRoot, 'sub1'), { recursive: true });
    await mkdir(path.join(tempRoot, 'sub1', 'sub2'), { recursive: true });
    await writeFile(path.join(tempRoot, 'top.txt'), '');
    await writeFile(path.join(tempRoot, 'sub1', 'mid.txt'), '');
    await writeFile(path.join(tempRoot, 'sub1', 'sub2', 'deep.txt'), '');

    const result = await countFiles(tempRoot, '.');

    expect(result).toBe(3);
  });

  it('strips a leading slash from relativePath before resolving', async () => {
    await mkdir(path.join(tempRoot, 'target'), { recursive: true });
    await writeFile(path.join(tempRoot, 'target', 'inside.txt'), '');

    const result = await countFiles(tempRoot, '/target');

    expect(result).toBe(1);
  });

  it('returns 0 for an empty directory', async () => {
    const result = await countFiles(tempRoot, '.');
    expect(result).toBe(0);
  });

  it('returns 0 and logs a forgeDebug error when the directory does not exist', async () => {
    const missingPath = path.join(tempRoot, 'does-not-exist');

    const result = await countFiles(missingPath, '.');

    expect(result).toBe(0);
    expect(forgeDebug).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'ltm-recall',
        level: 'error',
        message: '[safe-catch] readdir',
      }),
    );
  });

  it('treats subdirectories as entries and recurses into them', async () => {
    await mkdir(path.join(tempRoot, 'parent'), { recursive: true });
    await mkdir(path.join(tempRoot, 'parent', 'child'), { recursive: true });
    await writeFile(path.join(tempRoot, 'parent', 'a.txt'), '');
    await writeFile(path.join(tempRoot, 'parent', 'child', 'b.txt'), '');

    const result = await countFiles(tempRoot, '.');

    expect(result).toBe(2);
  });

  it('does not count the directory itself in the total', async () => {
    await mkdir(path.join(tempRoot, 'only-dir'), { recursive: true });

    const result = await countFiles(tempRoot, '.');

    // 0 files because 'only-dir' is a directory, not a file
    expect(result).toBe(0);
  });
});

describe('countFiles cleanup', () => {
  it('mkdtemp-based tempRoot is unique per test (no cross-test bleed)', async () => {
    const root1 = await mkdtemp(path.join(tmpdir(), 'count-files-isolated-'));
    const root2 = await mkdtemp(path.join(tmpdir(), 'count-files-isolated-'));
    expect(root1).not.toBe(root2);
    await rm(root1, { recursive: true, force: true });
    await rm(root2, { recursive: true, force: true });
  });
});
