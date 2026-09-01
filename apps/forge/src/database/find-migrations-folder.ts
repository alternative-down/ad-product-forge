import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { MigrationsJournalNotFoundError } from './migrate.errors';

/**
 * Walk up from start directory until a migrations/meta/_journal.json is found.
 * Handles both dev (src/database/ -> apps/forge/migrations/) and bundled
 * (dist/database/ -> dist/migrations/) layouts, as well as any future layout
 * drift. Pure runtime, no build-config coupling. (Refs #5674)
 *
 * Extracted from migrate.ts to a shared module per issue #6761 (DRY
 * consolidation). Previously duplicated locally in fixup-system-settings.ts
 * with an untyped Error throw; the duplication risked silent drift and was
 * based on a misreading of migrate.ts side effects. (Refs #6761)
 */
export function findMigrationsFolder(start: string): string {
  let dir = start;
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, 'migrations', 'meta', '_journal.json');
    if (existsSync(candidate)) return join(dir, 'migrations');
    dir = dirname(dir);
  }
  throw new MigrationsJournalNotFoundError(start);
}
