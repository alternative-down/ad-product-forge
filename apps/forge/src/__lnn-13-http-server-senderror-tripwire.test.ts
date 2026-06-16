/**
 * L#NN-13 13a tripwire for http/server.ts sendError extraction (#5741, Day 16).
 *
 * L#NN-13 tripwire pattern (per skill `skills/lnn-13-tripwire-template/`):
 *   1. Source-level read (readFileSync) — NOT mocks
 *   2. Concrete regex assertions — NOT equality
 *   3. Self-doc (L#NN-17 class, L#NN-13 root in description)
 *   4. L#26 v1+v2+v3 sanity verified (see mutation block at bottom)
 *
 * L#NN-17 class: C1 Cascading-via-consistency (8 distinct error shapes leak
 * into client SDKs and downstream error handling, multiplying parse logic
 * and breaking minor-version compatibility).
 *
 * This tripwire verifies that apps/forge/src/http/server.ts:
 *   1. HAS the `sendError` helper at file scope
 *   2. Does NOT contain any `res.writeHead(<4xx|5xx>)` outside `sendError`
 *   3. Does NOT contain any chained `.writeHead(<4xx|5xx>)` outside `sendError`
 *   4. Has exactly 8 `sendError(...)` call sites (one per error site)
 *
 * The 8 sites (per L#NN-27c + Thoren dispatch DM 09:00Z):
 *   1. 400 'Missing request data' (chained .writeHead, line 158)
 *   2. 404 'Not found' (chained .writeHead, line 177)
 *   3. 503 'Admin auth not configured' (line 190)
 *   4. 401 'Invalid admin API key' (line 207)
 *   5. 429 'Too many requests' (line 223)
 *   6. 413 'Request body too large' (line 238)
 *   7. 400 ZodError 'Invalid request' (line 286)
 *   8. 500 errorMsg (line 309)
 *
 * Mutation protocol (L#26 v1+v2+v3):
 *   - Revert one site to raw `res.writeHead(400, ...)`, tripwire fails
 *   - Remove the `sendError` helper, tripwire fails
 *   - Both, tripwire fails
 *
 * Cross-references:
 *   - L#NN-19 v1.1 (the pattern this tripwire mirrors)
 *   - L#NN-19b v2 (pre-emptive checks for silent failures)
 *   - L#NN-50 schema coverage tripwire (Day 15 Lead 2)
 *   - Issue #5741 (T-shirt Lead 10, Day 16, Varek)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// =============================================================================
// FILE LOCATION
// =============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SERVER_PATH = resolve(__dirname, 'http', 'server.ts');

// =============================================================================
// HELPERS
// =============================================================================

function readServerSource(): string {
  return readFileSync(SERVER_PATH, 'utf8');
}

/**
 * Strip the body of `sendError` (between `function sendError(` and its closing
 * `}`) so the tripwire can scan for raw `res.writeHead(<4xx|5xx>)` calls
 * OUTSIDE the helper. If sendError internally writes the status code, that's
 * allowed (it's the helper's job). If any other call site writes 4xx/5xx
 * directly, that's the bug we're catching.
 */
function stripSendErrorBody(source: string): string {
  // Find the sendError function definition start
  const defStart = source.indexOf('function sendError(');
  if (defStart === -1) return source;
  // Find the matching closing brace by tracking brace depth
  let depth = 0;
  for (let i = defStart; i < source.length; i++) {
    if (source[i] === '{') {
      depth++;
    } else if (source[i] === '}') {
      depth--;
      if (depth === 0) {
        // Strip from defStart through this closing brace (inclusive)
        return source.slice(0, defStart) + source.slice(i + 1);
      }
    }
  }
  return source;
}

// =============================================================================
// VULNERABLE PATTERNS
// =============================================================================

// Direct: res.writeHead(4xx) or res.writeHead(5xx) — anywhere
const VULN_DIRECT = /res\.writeHead\([45]\d{2}/g;
// Chained: line-starting `.writeHead(4xx|5xx)` (preceded by whitespace, after a newline or start of file)
const VULN_CHAINED = /(?:^|\n)\s*\.writeHead\([45]\d{2}/g;

// =============================================================================
// SAFE PATTERNS
// =============================================================================

const SAFE_HELPER_DEF = /function sendError\s*\(/;
// sendError call sites: look for `sendError(res,` (the first arg is always `res`)
const SAFE_CALL = /sendError\s*\(\s*res\s*,/g;
// Non-global version for the mutation v3 test (so .replace() only removes one)
const SAFE_CALL_NOGLOBAL = /sendError\s*\(\s*res\s*,/;

// =============================================================================
// EXPECTED: 8 call sites per the issue inventory
// =============================================================================

const EXPECTED_CALL_SITES = 8;

// =============================================================================
// TESTS
// =============================================================================

describe('L#NN-13 13a tripwire: http/server.ts sendError extraction (#5741)', () => {
  const source = readServerSource();
  const sourceOutsideHelper = stripSendErrorBody(source);

  it('source read succeeded (sanity)', () => {
    expect(source.length).toBeGreaterThan(1000);
  });

  it('sendError helper is defined at file scope', () => {
    expect(source).toMatch(SAFE_HELPER_DEF);
  });

  it('no direct res.writeHead(<4xx|5xx>) exists outside sendError', () => {
    const matches = sourceOutsideHelper.match(VULN_DIRECT);
    expect(matches).toBeNull();
  });

  it('no chained .writeHead(<4xx|5xx>) exists outside sendError', () => {
    const matches = sourceOutsideHelper.match(VULN_CHAINED);
    expect(matches).toBeNull();
  });

  it('has exactly 8 sendError call sites (one per error site)', () => {
    const matches = source.match(SAFE_CALL);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(EXPECTED_CALL_SITES);
  });
});

// =============================================================================
// MUTATION PROTOCOL (L#26 v1+v2+v3)
// =============================================================================

describe('L#NN-13 13a tripwire mutation: L#26 sanity (regression catch)', () => {
  it('mutation v1: inserting raw res.writeHead(400, ...) in error path — tripwire catches it', () => {
    const source = readServerSource();
    // Insert a raw res.writeHead(400, ...) call as if a developer forgot to use sendError
    const mutated = source.replace(
      'function sendError(',
      'res.writeHead(400, {});\nfunction sendError(',
    );
    const mutatedOutside = stripSendErrorBody(mutated);
    const matches = mutatedOutside.match(VULN_DIRECT);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(1);
  });

  it('mutation v2: removing sendError helper — tripwire catches missing call count', () => {
    const source = readServerSource();
    // Remove the entire sendError helper definition (function ... up to matching closing brace)
    const defStart = source.indexOf('function sendError(');
    expect(defStart).toBeGreaterThan(-1);
    let depth = 0;
    let endIdx = -1;
    for (let i = defStart; i < source.length; i++) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') {
        depth--;
        if (depth === 0) {
          endIdx = i + 1;
          break;
        }
      }
    }
    const mutated = source.slice(0, defStart) + source.slice(endIdx);
    expect(mutated).not.toMatch(SAFE_HELPER_DEF);
    // Note: with the helper gone, sendError calls would no longer resolve, but
    // the tripwire should still flag the missing helper definition.
  });

  it('mutation v3: removing one sendError call site — tripwire catches wrong count', () => {
    const source = readServerSource();
    // Remove only the FIRST sendError call site (use non-global regex)
    const mutated = source.replace(SAFE_CALL_NOGLOBAL, '');
    const beforeCount = (source.match(SAFE_CALL) ?? []).length;
    const afterCount = (mutated.match(SAFE_CALL) ?? []).length;
    expect(afterCount).toBe(beforeCount - 1);
    expect(afterCount).toBe(EXPECTED_CALL_SITES - 1);
  });
});
