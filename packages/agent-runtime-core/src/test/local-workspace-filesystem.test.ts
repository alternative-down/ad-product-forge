import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { LocalWorkspaceFilesystem } from '../integrations/gateways/local-workspace-filesystem.js';

describe('LocalWorkspaceFilesystem', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'workspace-fs-test-'));
    // Create structure: root/a.txt, root/sub/b.txt, root/sub/c.txt
    await fs.mkdir(path.join(tmpDir, 'sub'));
    await fs.writeFile(path.join(tmpDir, 'a.txt'), 'a');
    await fs.writeFile(path.join(tmpDir, 'sub', 'b.txt'), 'b');
    await fs.writeFile(path.join(tmpDir, 'sub', 'c.txt'), 'c');
  });

  afterEach(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  describe('listDirectory — workspace isolation (no host path leakage)', () => {
    it('returns relative paths from workspace root, never absolute host paths', async () => {
      const workspaceFs = new LocalWorkspaceFilesystem({ root: tmpDir });

      const entries = await workspaceFs.listDirectory('.');

      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        // Never expose absolute host paths
        expect(entry.path).not.toMatch(/^\/|^[A-Z]:/i);
        // Never include the tmpDir in the path
        expect(entry.path).not.toContain(tmpDir);
        expect(entry.path).not.toContain(os.tmpdir());
      }
    });

    it('paths are relative to workspace root for nested directories', async () => {
      const workspaceFs = new LocalWorkspaceFilesystem({ root: tmpDir });

      const entries = await workspaceFs.listDirectory('sub');

      expect(entries.length).toBe(2);
      for (const entry of entries) {
        // Path should be relative to workspace root, not absolute
        expect(entry.path).not.toMatch(/^\/|^[A-Z]:/i);
        expect(entry.path).not.toContain(tmpDir);
        // Path should be relative (no leading /)
        expect(entry.path).toMatch(/^[^/\\]/);
      }
      // Paths should include the subdirectory prefix
      const subEntry = entries.find((e) => e.name === 'b.txt');
      expect(subEntry).toBeDefined();
      expect(subEntry!.path).toBe('sub/b.txt');
    });

    it('includes entry name correctly even when path is relative', async () => {
      const workspaceFs = new LocalWorkspaceFilesystem({ root: tmpDir });

      const entries = await workspaceFs.listDirectory('.');

      const aEntry = entries.find((e) => e.name === 'a.txt');
      const subEntry = entries.find((e) => e.name === 'sub');

      expect(aEntry).toBeDefined();
      expect(aEntry!.name).toBe('a.txt');
      expect(aEntry!.path).toBe('a.txt');
      expect(subEntry).toBeDefined();
      expect(subEntry!.isDirectory).toBe(true);
      expect(subEntry!.path).toBe('sub');
    });
  });
});
