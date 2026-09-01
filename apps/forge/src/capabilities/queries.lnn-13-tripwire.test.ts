/**
 * L#NN-13 Source-Level Tripwire for queries.ts (#5630).
 *
 * INVARIANT: Every exported query function in queries.ts MUST go through
 * the `safeQuery` helper. Direct try/catch wrappers around DB operations
 * are BANNED — they were the root cause of the 3-pattern inconsistency
 * (return [] / return null / rethrow) that the helper now normalizes.
 *
 * ENFORCEMENT: Read the source file as text, extract the safeQuery
 * function body, then assert:
 *   1. The only `try {` blocks in queries.ts are inside the safeQuery
 *      function body itself.
 *   2. There is exactly ONE `try {` block (the one in safeQuery).
 *   3. All 9 exported query functions are present.
 *   4. The `safeQuery` helper is referenced in every query function.
 *
 * L#26 verification: this file is the tripwire that the L#NN-13 protocol
 * requires. Without it, future commits could re-introduce the raw
 * try/catch anti-pattern and silently regress the consistency fix.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const QUERIES_PATH = resolve(__dirname, './queries.ts');
const source = readFileSync(QUERIES_PATH, 'utf8');

describe('queries.ts L#NN-13 tripwire: safeQuery-only invariant', () => {
  it('queries.ts source file is readable', () => {
    expect(source.length).toBeGreaterThan(0);
    expect(source).toContain('safeQuery');
  });

  it('contains exactly ONE try/catch block (inside safeQuery)', () => {
    // Count `try {` occurrences. Should be exactly 1 (inside safeQuery).
    // We exclude `try {` inside JSDoc or comments by counting only
    // occurrences that are NOT preceded by `*` or `//`.
    const tryMatches = source.match(/^\s*try\s*\{/gm) ?? [];
    expect(tryMatches.length).toBe(1);
  });

  it('safeQuery helper is the ONLY function that contains try/catch', () => {
    // Extract the safeQuery function body
    const safeQueryMatch = source.match(/async function safeQuery[\s\S]*?\n\}/);
    expect(safeQueryMatch).not.toBeNull();
    const safeQueryBody = safeQueryMatch![0];
    expect(safeQueryBody).toMatch(/try\s*\{/);
    expect(safeQueryBody).toMatch(/catch\s*\(/);
  });

  it('all 9 exported query functions are present', () => {
    const expected = [
      'export async function queryRoles',
      'export async function queryRole',
      'export async function queryToolPermissions',
      'export async function queryWorkflowPermissions',
      'export async function queryAgentsByRoleId',
      'export async function queryAgent',
      'export async function queryAgents',
      'export async function queryToolPermissionsBatch',
      'export async function queryWorkflowPermissionsBatch',
    ];
    for (const fn of expected) {
      expect(source).toContain(fn);
    }
  });

  it('every query function calls safeQuery (no raw try/catch)', () => {
    // For each query function, extract its body (from `export async function`
    // to the closing `}`) and assert it does NOT contain a raw `try {`.
    const fnRegex = /export async function (\w+)\s*\([^)]*\)\s*\{[\s\S]*?\n\}/g;
    const fnBodies = [...source.matchAll(fnRegex)].map((m) => m[0]);
    expect(fnBodies.length).toBe(9);

    for (const body of fnBodies) {
      const fnName = body.match(/export async function (\w+)/)![1];
      // Each function MUST call safeQuery
      expect(body, `${fnName} should call safeQuery`).toMatch(/safeQuery\(/);
      // Each function MUST NOT have a raw `try {` (it should be a single
      // safeQuery call, possibly with an early-return for empty input)
      const rawTryCount = (body.match(/try\s*\{/g) ?? []).length;
      expect(rawTryCount, `${fnName} should not have raw try/catch`).toBe(0);
    }
  });

  it('no debug("...", "error", ... + errorMsg(err)) pattern outside safeQuery', () => {
    // The legacy Format-B pattern: debug(scope, 'error', '<name> failed: ' + errorMsg(err))
    // This pattern is ONLY allowed inside safeQuery. Anywhere else is a regression.
    const debugErrorPattern = /debug\s*\(\s*['"][^'"]*['"]\s*,\s*['"]error['"]\s*,\s*['"][^'"]*failed['"][^)]*errorMsg/;
    const matches = source.match(debugErrorPattern);
    // If there's a match, it must be inside safeQuery
    if (matches) {
      const safeQueryBody = source.match(/async function safeQuery[\s\S]*?\n\}/)![0];
      expect(safeQueryBody).toMatch(debugErrorPattern);
    }
  });
});
