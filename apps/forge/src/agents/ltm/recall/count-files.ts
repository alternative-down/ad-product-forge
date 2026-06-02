import path from 'node:path';
import fs from 'node:fs/promises';
import { forgeDebug } from '@forge-runtime/core';
import { errorMsg } from '../../error-formatting';

/** Recursively counts files under rootPath/relativePath. Returns 0 on error. */
export async function countFiles(rootPath: string, relativePath: string): Promise<number> {
  const absolutePath = path.resolve(rootPath, relativePath.replace(/^\//, ''));
  const entries = await fs.readdir(absolutePath, { withFileTypes: true }).catch((err) => {
    forgeDebug({
      scope: 'ltm-recall',
      level: 'error',
      message: '[safe-catch] readdir',
      context: { error: errorMsg(err) },
    });
    return null;
  });

  if (!entries) return 0;

  let total = 0;
  for (const entry of entries) {
    if (entry.isFile()) {
      total += 1;
    } else if (entry.isDirectory()) {
      total += await countFiles(rootPath, path.posix.join(relativePath, entry.name));
    }
  }
  return total;
}
