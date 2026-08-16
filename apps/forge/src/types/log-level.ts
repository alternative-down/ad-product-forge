/**
 * Canonical LogLevel type for forge debug helpers.
 *
 * Pattern: L#NN-50 #18 N=5 PROMOTION (D47 cycle 29).
 *
 * This string-literal union is the canonical type used by all module-local
 * debug helpers across apps/forge/src (469+ call sites per L#NN-50 #18 v10).
 *
 * Note: @forge-runtime/core exports a numeric `LogLevel` enum (DEBUG=0,
 * INFO=1, WARN=2, ERROR=3) used internally for log routing. This local type
 * uses string literals to match the convention used by debug helper signatures
 * like `function fooDebug(level: 'debug' | 'info' | 'warn' | 'error', ...)`.
 * The string form is forwards-compatible with the underlying forgeDebug
 * function which accepts `level: string` (see packages/forge-runtime-core/src/debug.ts).
 *
 * Source: extracted from inline union literals in:
 *   - apps/forge/src/main.ts (entry point)
 *   - 42 files in apps/forge/src/ (count as of D47 cycle 29 dispatch)
 *   - 37+ remaining sites scheduled for future cycles (cycle 30+)
 *
 * Cycle 29 scope: 5 sites in apps/forge/src/github/ops/ module:
 *   - app-lifecycle.ts
 *   - issues.ts
 *   - labels-debug.ts
 *   - milestones.ts
 *   - routing.ts
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
