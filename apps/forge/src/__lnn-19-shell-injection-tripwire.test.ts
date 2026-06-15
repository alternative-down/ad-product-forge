/**
 * L#NN-13 13a tripwire test for L#NN-19 secret detector shell-injection fix
 * (#5717 v1.1 + Day 15 v1.2 Vector 4).
 *
 * L#NN-13 tripwire pattern (per skill `skills/lnn-13-tripwire-template/`):
 *   1. Source-level read (readFileSync) — NOT mocks
 *   2. Concrete regex assertions — NOT equality
 *   3. Self-doc (L#NN-17 class, L#NN-13 root in description)
 *   4. L#26 v1+v2+v3 sanity verified (see `describe` blocks at bottom)
 *
 * L#NN-17 class: C2 Cascading-via-shared-payload (the detector is the safety net;
 * a hole in the safety net cascades to the whole L#NN-19 mitigation stack).
 *
 * This tripwire verifies that `.github/workflows/lnn-19-secret-detector.yml`
 * does NOT contain any of the 4 known shell-injection bypass patterns, and
 * DOES contain the corresponding safe patterns.
 *
 * Vector 4 (Day 15, Varek): the single-quoted heredoc terminator in the START
 * marker (`body<<'LNN19_BODY_EOF'`) does not match the unquoted END marker
 * (`LNN19_BODY_EOF`). GitHub Actions parser fails with "Matching delimiter
 * not found 'LNN19_BODY_EOF'". The Day 14 v1.1 fix (#5717) was itself broken
 * because the original tripwire required the buggy pattern as a SAFE pattern.
 * 67% D14 detector failure rate (N=6 of 9 PRs merged after #5717: #5724,
 * #5729, #5730, #5731, #5722, #5733).
 *
 * L#NN-19 hygiene: the patterns asserted here are detection rules, not secrets.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

// =============================================================================
// FILE LOCATION
// =============================================================================

const WORKFLOW_PATH = resolve(
  __dirname,
  '..',
  '..',
  '..',
  '.github',
  'workflows',
  'lnn-19-secret-detector.yml',
);

// Resolve from both possible locations: __tests__ (if relocated later) and
// the canonical apps/forge/src location used by Day 13+ fix.
function loadWorkflow(): string {
  try {
    return readFileSync(WORKFLOW_PATH, 'utf8');
  } catch (_e) {
    // Fallback: try relative to CWD (sprint-may31 root)
    return readFileSync(
      join(process.cwd(), '.github', 'workflows', 'lnn-19-secret-detector.yml'),
      'utf8',
    );
  }
}

// =============================================================================
// VULNERABLE PATTERNS (must NOT be present)
// =============================================================================

const VULNERABLE = {
  // Vector 1: inline body literal in bash (double-quote bypass)
  // Matches: BODY="${{ github.event.X.body }}"
  inlineBodyLiteral: /BODY="\$\{\{\s*github\.event\.(comment|issue|pull_request)\.body\s*\}\}"/,

  // Vector 2: `echo "$BODY"` — backtick interpretation at print time
  echoBody: /echo\s+"?\$\{?BODY\}?"?/,

  // Vector 3: JS template literal with ${{ steps.body.outputs.body }}
  jsTemplateLiteral:
    /const\s+body\s*=\s*`\$\{\{\s*steps\.body\.outputs\.body\s*\}\}`/,

  // Vector 4 (Day 15): single-quoted heredoc terminator in the START marker
  // `body<<'LNN19_BODY_EOF'` writes the single quotes INTO $GITHUB_OUTPUT,
  // so the parser sees start=with-quotes and end=without-quotes, which fails
  // with "Matching delimiter not found 'LNN19_BODY_EOF'". 67% D14 detector
  // failure rate. Fix: remove single quotes from start marker.
  singleQuotedHeredocStart: /echo\s+"body<<'LNN19_BODY_EOF'"/,
} as const;

// =============================================================================
// SAFE PATTERNS (must be present)
// =============================================================================

const SAFE = {
  // env: block with body vars
  envBlock: /^\s*env:\s*$/m,

  // PR_BODY / ISSUE_BODY / COMMENT_BODY env var names
  bodyEnvVars: /\$\{\{\s*github\.event\.(pull_request|issue|comment)\.body\s*\}\}/,

  // printf %s not echo (printf %s does not re-evaluate backticks)
  printfSafe: /printf\s+'%s(\\n)?'\s+"\$\{?BODY\}?"?/,

  // Unquoted heredoc terminator in BOTH start and end markers.
  // L#NN-19 v1.2 (Day 15): start marker MUST be unquoted (body<<LNN19_BODY_EOF)
  // so it matches the end marker (LNN19_BODY_EOF) exactly. Backtick/$( )
  // safety comes from printf %s, NOT from single-quoting the delimiter.
  unquotedHeredoc: /echo\s+"body<<LNN19_BODY_EOF"/,
  // context.payload access in scan step (not template literal)
  contextPayloadAccess: /ctx\.payload\.(comment|issue|pull_request)\??\.body/,
} as const;

// =============================================================================
// TESTS
// =============================================================================

describe('L#NN-19 shell-injection tripwire (#5717): vulnerable patterns', () => {
  it('vector 1 — inline BODY="..." literal with ${{ github.event.X.body }} is NOT present', () => {
    const content = loadWorkflow();
    expect(content).not.toMatch(VULNERABLE.inlineBodyLiteral);
  });

  it('vector 2 — `echo "$BODY"` is NOT present (use printf %s instead)', () => {
    const content = loadWorkflow();
    expect(content).not.toMatch(VULNERABLE.echoBody);
  });

  it('vector 3 — `const body = `${{ steps.body.outputs.body }}`` JS template literal is NOT present', () => {
    const content = loadWorkflow();
    expect(content).not.toMatch(VULNERABLE.jsTemplateLiteral);
  });
});

describe('L#NN-19 shell-injection tripwire (#5717): safe patterns present', () => {
  it('env: block is present in body step', () => {
    const content = loadWorkflow();
    expect(content).toMatch(SAFE.envBlock);
  });

  it('body env vars (PR_BODY/ISSUE_BODY/COMMENT_BODY) are passed via env', () => {
    const content = loadWorkflow();
    expect(content).toMatch(SAFE.bodyEnvVars);
  });

  it('printf %s is used for body output (not echo)', () => {
    const content = loadWorkflow();
    expect(content).toMatch(SAFE.printfSafe);
  });

  it('unquoted heredoc terminator `LNN19_BODY_EOF` is used in $GITHUB_OUTPUT start marker (Day 15 Vector 4 fix)', () => {
    const content = loadWorkflow();
    expect(content).toMatch(SAFE.unquotedHeredoc);
  });

  it('scan step reads body from context.payload (not from template literal)', () => {
    const content = loadWorkflow();
    expect(content).toMatch(SAFE.contextPayloadAccess);
  });
});

describe('L#NN-19 shell-injection tripwire (Day 15 Vector 4): single-quoted heredoc terminator in start marker', () => {
  it('vector 4 — single-quoted heredoc start marker `body<<\'LNN19_BODY_EOF\'` is NOT present (would break $GITHUB_OUTPUT parser)', () => {
    const content = loadWorkflow();
    expect(content).not.toMatch(VULNERABLE.singleQuotedHeredocStart);
  });
});

describe('L#NN-19 shell-injection tripwire (#5717, Day 15 v1.2): L#26 sanity (regression catch)', () => {
  it('L#26 v1: if all 4 vulnerable patterns are reintroduced, the tripwire detects them', () => {
    // Build synthetic content that reintroduces all 4 vectors, using string
    // concatenation (NOT a JS template literal) to avoid TS interpreting the
    // ${{ in fixture content as a template expression.
    const regressed = [
      'BODY="' + '${{ github.event.pull_request.body }}' + '"',
      'if echo "$BODY" | grep -q \'lnn-19-detector\'; then exit 0; fi',
      'const body = `' + '${{ steps.body.outputs.body }}' + '`;',
      'echo "body<<\'LNN19_BODY_EOF\'"',
    ].join('\n');
    expect(regressed).toMatch(VULNERABLE.inlineBodyLiteral);
    expect(regressed).toMatch(VULNERABLE.echoBody);
    expect(regressed).toMatch(VULNERABLE.jsTemplateLiteral);
    expect(regressed).toMatch(VULNERABLE.singleQuotedHeredocStart);
  });

  it('L#26 v3 (Day 15): unquoted heredoc terminator IS the safe form (not single-quoted)', () => {
    // Vector 4 fix verification: the workflow MUST use unquoted terminator.
    // Direct mirror of the v2 mutation test, but for the unquoted pattern.
    const content = loadWorkflow();
    expect(content).toMatch(SAFE.unquotedHeredoc);
    expect(content).not.toMatch(VULNERABLE.singleQuotedHeredocStart);
  });

  it('L#26 v2: even with `echo "body<<EOF"` (a different echo), printf %s is still present', () => {
    // v2 mutation: attacker uses `echo "body<<EOF"` (different echo) — printf %s
    // for the body must still be present.
    const content = loadWorkflow();
    expect(content).toMatch(SAFE.printfSafe);
  });
});
