/**
 * Shared skill-related utilities used by both global-skills.ts and
 * workspace-skills.ts. Extracted to reduce duplication (108-line clone group).
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { forgeDebug } from '@forge-runtime/core';

/**
 * Parse YAML frontmatter metadata from a skill file.
 * Extracts the `description` field if present.
 *
 * Frontmatter format:
 * ---
 * description: "My skill description"
 * ---
 * <skill content>
 */
export function parseSkillMetadata(skillContent: string): { description?: string } {
  if (!skillContent.startsWith('---\n')) {
    return {};
  }

  const endIndex = skillContent.indexOf('\n---\n', 4);

  if (endIndex === -1) {
    return {};
  }

  const frontmatter = skillContent.slice(4, endIndex);
  const lines = frontmatter.split('\n');
  let description: string | undefined;

  for (const line of lines) {
    const separatorIndex = line.indexOf(':');

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '');

    if (key === 'description' && value) {
      description = value;
    }
  }

  return { description };
}

/**
 * Recursively count regular files under a directory root.
 * Symlinks are followed. Directories themselves are not counted.
 */
export async function countSkillFiles(skillRoot: string): Promise<number> {
  try {
    const entries = await fs.readdir(skillRoot, { withFileTypes: true });
    let fileCount = 0;

    for (const entry of entries) {
      const entryPath = path.resolve(skillRoot, entry.name);

      if (entry.isDirectory()) {
        fileCount += await countSkillFiles(entryPath);
        continue;
      }

      if (entry.isFile()) {
        fileCount += 1;
      }
    }

    return fileCount;
  } catch (err) {
    forgeDebug({
      scope: 'skills-shared',
      level: 'error',
      message: 'countSkillFiles failed',
      context: { error: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }
}
