/**
 * Admin route: POST /admin/system/fixup-columns
 *
 * L#NN-32 v17: thin HTTP wrapper around pure DB function.
 * L#NN-19 v1.2 hygiene: no env values, no secrets in response.
 *
 * CONTEXT
 * -------
 * D56 postmortem (#6725): PR #6723 startup fixup inserted a WRONG
 * Drizzle hash into __drizzle_migrations. This created a time-bomb: the
 * next deploy would re-apply migration 0031 (ALTER TABLE ADD COLUMN
 * created_at) and crash with duplicate column error.
 *
 * PRIMARY FIX: cleanupFixupJournalEntry() in migrate.ts runs on every
 * startup BEFORE the migration loop. It idempotently removes the wrong
 * hash and inserts the correct one. This defuses the time-bomb.
 *
 * THIS ROUTE is a LONG-TERM UTILITY for future wrong-hash scenarios
 * where the startup fixup alone is insufficient. The route computes the
 * REAL Drizzle hash at runtime (SHA-256 of FULL SQL file with comments
 * per L#NN-Drizzle-Hash-Includes-Comments v1), syncs the journal, and
 * adds the column if missing.
 *
 * Cold-start test protocol (L#NN-P0-Startup-Script v1, 5 steps):
 *   1. Local clean install → verify normal startup
 *   2. Inspect startup log → verify cleanupFixupJournalEntry ran
 *   3. Query __drizzle_migrations → wrong hash GONE, correct 0031 hash present
 *   4. Trigger this route → verify idempotent (already_clean)
 *   5. Apply migration 0031 manually → verify SKIP
 *
 * See #6722 (P0 reopened), #6725 (postmortem), PR #6724 (revert).
 */

import type { LibSQLDatabase } from 'drizzle-orm/libsql';

import { adminRouteError } from '../agents/admin-route-error-helper';
import { forgeDebug } from '../debug';
import { jsonResponse } from '../helpers';
import { errorMsg } from '../../../agents/error-formatting';
import {
  fixupSystemSettingsCreatedAt,
  type FixupColumnsResult,
} from '../../../database/fixup-system-settings';

const PATH = '/admin/system/fixup-columns';


// Unexported in E12 — zero internal + zero external usages. The `PATH` constant is used internally at line 138; FIXUP_COLUMNS_PATH was a re-export with no consumers.
const FIXUP_COLUMNS_PATH = PATH;

/**
 * Handler body for /admin/system/fixup-columns.
 * Exported separately for test coverage and for direct invocation from
 * the registration site in write.ts (which has the httpServer dep).
 */
export async function handleFixupColumns(
  db: LibSQLDatabase<Record<string, unknown>>,
): Promise<FixupColumnsResult> {
  forgeDebug({
    scope: 'admin-fixup-columns',
    level: 'info',
    message: 'admin/system/fixup-columns: invoked',
  });
  try {
    const result = await fixupSystemSettingsCreatedAt(db);
    forgeDebug({
      scope: 'admin-fixup-columns',
      level: 'info',
      message: `admin/system/fixup-columns: success action=${result.action}`,
      context: {
        action: result.action,
        deletedWrongHash: result.deletedWrongHash,
        addedColumn: result.addedColumn,
        insertedJournalEntry: result.insertedJournalEntry,
        computedHash: result.computedHash,
      },
    });
    return result;
  } catch (err) {
    forgeDebug({
      scope: 'admin-fixup-columns',
      level: 'error',
      message: 'admin/system/fixup-columns: FAILED',
      context: { error: errorMsg(err) },
    });
    throw err;
  }
}

/**
 * Wrap handler with the standard admin error response format.
 * Returns a JSON response suitable for httpServer.registerRoute.
 */
export async function fixupColumnsHandler(
  db: LibSQLDatabase<Record<string, unknown>>,
): Promise<ReturnType<typeof jsonResponse>> {
  try {
    const result = await handleFixupColumns(db);
    return jsonResponse(result);
  } catch (err) {
    return adminRouteError(err, { path: PATH });
  }
}
