// Tripwire: enforce that getSettings does NOT silently return DEFAULTS on
// DB error (L#NN-50 #19 v3, #6028 P2).
//
// Before #6028: getSettings had a try/catch that returned DEFAULTS on any
// error (including DB errors). Callers couldn't distinguish:
//   - 'settings not initialized yet' (row=null → DEFAULTS, OK)
//   - 'DB query failed' (error → DEFAULTS, BUG: hides real failure)
//
// After #6028: getSettings uses withDbErrorLogging which logs + re-throws
// DB errors. Only the row=null case returns DEFAULTS (handled by mapRow).
//
// This tripwire asserts:
// 1. getSettings does NOT have a try/catch + return DEFAULTS pattern
// 2. getSettings DOES use withDbErrorLogging (the canonical helper)
// 3. The 'silent failure' return-DEFAULTS shape is gone

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE_PATH = resolve(__dirname, 'store.ts');

describe('L#NN-50 #19 v3 tripwire: system-settings/getSettings has no silent failure (#6028)', () => {
  const source = readFileSync(FILE_PATH, 'utf8');

  // Locate the getSettings function body (between `async function getSettings`
  // and its closing `}`).
  function extractFunctionBody(name: string): string {
    const start = source.indexOf(`async function ${name}`);
    expect(start, `${name} function must exist`).toBeGreaterThanOrEqual(0);
    let depth = 0;
    let i = source.indexOf('{', start);
    expect(i).toBeGreaterThan(start);
    for (; i < source.length; i++) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') {
        depth--;
        if (depth === 0) return source.slice(start, i + 1);
      }
    }
    return '';
  }

  const getSettingsBody = extractFunctionBody('getSettings');

  it('getSettings uses withDbErrorLogging (canonical helper, Format A logging)', () => {
    expect(getSettingsBody).toMatch(/withDbErrorLogging\s*\(\s*\{/);
    expect(getSettingsBody).toMatch(/verb:\s*['"]read['"]/);
    expect(getSettingsBody).toMatch(/op:\s*['"]getSettings['"]/);
  });

  it('getSettings does NOT silently return DEFAULTS on error', () => {
    // Anti-pattern: `catch (err) { ... return { ...DEFAULTS, ... }; }`
    // Look for the literal pattern of returning DEFAULTS inside a catch.
    const silentFailure = /catch\s*\([^)]*\)\s*\{[^}]*\{\s*\.\.\.\s*DEFAULTS[^}]*\}/m.test(getSettingsBody);
    expect(silentFailure, 'getSettings must NOT return DEFAULTS inside a catch block').toBe(false);
  });

  it('getSettings does NOT have a top-level try/catch around the DB call', () => {
    // The function should NOT have its own try/catch — withDbErrorLogging
    // handles the error internally (logs + re-throws).
    expect(getSettingsBody).not.toMatch(/\btry\s*\{[^}]*db\.query\.systemSettings\.findFirst/);
  });
});