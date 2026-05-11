/**
 * workspace-skill-helpers.ts
 *
 * Shared helpers for workspace skill operations.
 * Extracted from workspace-skill-archive.ts and global-skills.ts.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { forgeDebug } from '@forge-runtime/core';

export async function ensureDirectory(targetPath: string): Promise<void> {
  try {
    const stat = await fs.stat(targetPath);

    if (stat.isDirectory()) {
      return;
    }

    await fs.rm(targetPath, { force: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      forgeDebug({
        scope: 'workspace-skills',
        level: 'info',
        message: `ensureDirectory failed: ${error}`,
      });
      throw error;
    }
  }

  try {
    await fs.mkdir(targetPath, { recursive: true });
  } catch (error) {
    forgeDebug({
      scope: 'workspace-skills',
      level: 'error',
      message: `fs.mkdir failed: ${error}`,
      context: { targetPath },
    });
    throw error;
  }
}

export async function ensureParentDirectories(
  targetPath: string,
  rootPath: string,
): Promise<void> {
  const rel = path.relative(rootPath, targetPath);
  const parts = rel.split(path.sep);

  let currentPath = rootPath;
  for (let i = 0; i < parts.length - 1; i++) {
    currentPath = path.join(currentPath, parts[i]);
    await ensureDirectory(currentPath);
  }
}

export type NormalizeResult = {
  safePath: string;
  isDirectory: boolean;
};

export function normalizeArchiveEntryPath(entryPath: string): NormalizeResult {
  const normalizedPath = entryPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const isDirectory = normalizedPath.endsWith('/');
  const withoutSkillsPrefix = normalizedPath.startsWith('skills/')
    ? normalizedPath.slice('skills/'.length)
    : normalizedPath;
  const safePath = path.posix.normalize(
    isDirectory ? withoutSkillsPrefix.slice(0, -1) : withoutSkillsPrefix,
  );

  if (!safePath || safePath === '.' || safePath.startsWith('../') || safePath.includes('/../')) {
    forgeDebug({
      scope: 'workspace-skills',
      level: 'warn',
      message: `Blocked invalid archive entry: ${entryPath}`,
    });
    throw new Error(`Invalid skill archive entry: ${entryPath}`);
  }

  return { safePath, isDirectory };
}