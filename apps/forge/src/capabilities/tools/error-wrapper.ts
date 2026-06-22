/**
 * tools/_error-wrapper.ts
 *
 * BACK-COMPAT SHIM — re-exports `withToolErrorLogging` and `ToolResult<T>` from
 * `@forge-runtime/core` (where they were moved in #5889).
 *
 * Existing import paths in `apps/forge` keep working unchanged:
 *   import { withToolErrorLogging } from '../capabilities/tools/error-wrapper';
 *
 * New code SHOULD import directly from `@forge-runtime/core`:
 *   import { withToolErrorLogging, type ToolResult } from '@forge-runtime/core';
 *
 * ─── Why this shim exists ───────────────────────────────────────────────────
 *
 * Without the shim, moving `withToolErrorLogging` to the package would
 * require updating 10 consumer files in apps (`coolify/tools.ts`,
 * `communication/internal-chat-sending.ts`, `minimax/tools.ts`, etc.).
 * The shim preserves those import paths via a thin re-export, so this PR
 * stays a small, single-package refactor with zero consumer churn.
 *
 * ─── Related issues ────────────────────────────────────────────────────────
 *
 *   - #5889: this shim's back-compat rationale
 *   - #5809: L#NN-50 #12 family umbrella
 *   - #5887: Phase 11 (consumes from new package location, then this shim
 *           becomes a pure convenience re-export)
 */

/* eslint-disable reexport-check/no-unnecessary-reexports */
// Import from package source via relative path (bypasses vitest alias of
// @forge-runtime/core, so vi.mock('@forge-runtime/core') in tests does NOT
// break this shim's re-export. See: PR #5889 back-compat shim rationale).
export { withToolErrorLogging, type ToolResult } from '@forge-runtime/core';
