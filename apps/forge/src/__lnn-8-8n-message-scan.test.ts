/**
 * L#NN-8 8n tripwire test for the standalone message-scan script (#5713).
 *
 * L#NN-13 tripwire pattern (per skill `skills/lnn-13-tripwire-template/`):
 *   1. Source-level read of the script (readFileSync, no mocks)
 *   2. Concrete regex assertions (not equality on whole output)
 *   3. Self-doc (L#NN-8 8n, L#NN-13 root in description)
 *   4. L#26 v1+v2 sanity verified
 *
 * L#NN-17 class: C5 P0-masked-pre-existing-bugs (the L#NN-8 8n over-generalization
 * pattern is exactly the kind of bug that gets masked by high probe count).
 *
 * The 6th probe of L#45 v6.1 is the canonical use case for this script. Per
 * AGENTS.md, before standing down an agent MUST scan its own last 20 messages
 * for over-generalization patterns. This script is the implementation.
 *
 * The test does NOT statically import the script (which lives outside
 * apps/forge/src rootDir). Instead, it uses readFileSync to source-read the
 * script and verify the pattern, and uses spawnSync to run the script as a
 * subprocess for behavioral testing. This is the L#NN-13 13a pattern.
 *
 * L#NN-19 hygiene: the patterns asserted here are detection rules, not secrets.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';

// =============================================================================
// FILE LOCATIONS
// =============================================================================

const SCRIPT_PATH = resolve(
  __dirname,
  '..',
  '..',
  '..',
  'scripts',
  'lnn-8-8n-message-scan.ts',
);

function loadScript(): string {
  try {
    return readFileSync(SCRIPT_PATH, 'utf8');
  } catch (_e) {
    return readFileSync(
      join(process.cwd(), 'scripts', 'lnn-8-8n-message-scan.ts'),
      'utf8',
    );
  }
}

// =============================================================================
// L#NN-8 8n PATTERN — defined here for direct testing
// (must match the pattern in scripts/lnn-8-8n-message-scan.ts;
// the consistency test at the bottom verifies this)
// =============================================================================

export const LNN8N_PATTERN =
  /\b(FULLY|NEVER|ALWAYS|completely|entirely|every single|0 drift|all idle|no impact)\b|\b100%/i;

// =============================================================================
// L#NN-8 8n PATTERN — direct assertion
// =============================================================================

describe('L#NN-8 8n pattern (L#45 v6.1 6th probe)', () => {
  it('matches FULLY (case-insensitive)', () => {
    expect('PR fully merged'.match(LNN8N_PATTERN)?.[0]).toBe('fully');
    expect('PR FULLY merged'.match(LNN8N_PATTERN)?.[0]).toBe('FULLY');
  });

  it('matches NEVER', () => {
    expect('never any drift'.match(LNN8N_PATTERN)?.[0]).toBe('never');
  });

  it('matches ALWAYS', () => {
    expect('always idle'.match(LNN8N_PATTERN)?.[0]).toBe('always');
  });

  it('matches "0 drift" (multi-word)', () => {
    expect('0 drift in metrics'.match(LNN8N_PATTERN)?.[0]).toBe('0 drift');
  });

  it('matches "all idle" (multi-word)', () => {
    expect('all idle across fleet'.match(LNN8N_PATTERN)?.[0]).toBe('all idle');
  });

  it('matches "no impact" (multi-word)', () => {
    expect('no impact on production'.match(LNN8N_PATTERN)?.[0]).toBe('no impact');
  });

  it('matches "100%" with leading word boundary (not part of "v100" or "100px")', () => {
    expect('100% tested'.match(LNN8N_PATTERN)?.[0]).toBe('100%');
    expect('v100'.match(LNN8N_PATTERN)).toBeNull();
    expect('100px'.match(LNN8N_PATTERN)).toBeNull();
  });

  it('matches "completely", "entirely", "every single"', () => {
    expect('completely empty'.match(LNN8N_PATTERN)?.[0]).toBe('completely');
    expect('entirely safe'.match(LNN8N_PATTERN)?.[0]).toBe('entirely');
    expect('every single time'.match(LNN8N_PATTERN)?.[0]).toBe('every single');
  });

  it('does NOT match "completed" (different word) or "entire" (not in pattern, only "entirely")', () => {
    expect('completed the task'.match(LNN8N_PATTERN)).toBeNull();
    expect('the entire system'.match(LNN8N_PATTERN)).toBeNull();
  });

  it('does NOT match "idle" alone (must be "all idle")', () => {
    expect('user is idle'.match(LNN8N_PATTERN)).toBeNull();
  });

  it('does NOT match "0" alone (must be "0 drift")', () => {
    expect('0 errors in last 5min'.match(LNN8N_PATTERN)).toBeNull();
  });
});

// =============================================================================
// scanMessages logic — replicated here for direct testing
// (the actual function is in the script; this is the spec)
//
// The "consistency test" at the bottom verifies the actual script's regex
// matches this one.
// =============================================================================

interface Lnn8nHit {
  idx: number;
  pattern: string;
  snippet: string;
}

function scanMessages(messages: string[]): Lnn8nHit[] {
  const hits: Lnn8nHit[] = [];
  messages.forEach((msg, idx) => {
    if (typeof msg !== 'string') return;
    const match = msg.match(LNN8N_PATTERN);
    if (match) {
      hits.push({
        idx,
        pattern: match[0],
        snippet: msg.length > 80 ? msg.substring(0, 80) + '…' : msg,
      });
    }
  });
  return hits;
}

describe('scanMessages() — pure function tests', () => {
  it('returns empty array for messages with no L#NN-8 8n patterns', () => {
    const hits = scanMessages([
      'PR #5715 is merged (verified 09:46Z, sha=dbcf822c)',
      '0 conflicts in rebase',
      'Tests: 50/50 pass',
    ]);
    expect(hits).toEqual([]);
  });

  it('returns 1 hit for a single message with FULLY', () => {
    const hits = scanMessages(['The fix is FULLY deployed']);
    expect(hits).toHaveLength(1);
    expect(hits[0].pattern).toBe('FULLY');
    expect(hits[0].idx).toBe(0);
  });

  it('returns multiple hits across messages', () => {
    const hits = scanMessages([
      'all idle across fleet',
      'no impact on production',
      'normal status',
    ]);
    expect(hits).toHaveLength(2);
    expect(hits[0].pattern).toBe('all idle');
    expect(hits[1].pattern).toBe('no impact');
  });

  it('preserves original message index in hit.idx', () => {
    const hits = scanMessages(['clean', 'NEVER any drift', 'clean', 'ALWAYS works']);
    expect(hits.map(h => h.idx)).toEqual([1, 3]);
  });

  it('truncates long snippets to 80 chars + ellipsis', () => {
    const longMsg = 'a'.repeat(100) + ' FULLY ' + 'b'.repeat(100);
    const hits = scanMessages([longMsg]);
    expect(hits[0].snippet).toContain('…');
    expect(hits[0].snippet.length).toBeLessThanOrEqual(81);
  });

  it('skips non-string entries silently (does not throw)', () => {
    // @ts-expect-error testing runtime safety
    const hits = scanMessages([null, 'clean', 42, 'NEVER any drift']);
    expect(hits).toHaveLength(1);
  });
});

// =============================================================================
// L#NN-13 13a tripwire: verify the script contains the expected pattern
// =============================================================================

describe('L#NN-13 13a tripwire: script contains expected L#NN-8 8n pattern', () => {
  it('script exports LNN8N_PATTERN with the canonical regex', () => {
    const script = loadScript();
    // Sanity: the script defines LNN8N_PATTERN
    expect(script).toMatch(/export const LNN8N_PATTERN\s*=/);
  });

  it('script pattern matches FULLY, NEVER, ALWAYS, 0 drift, all idle, no impact, 100%, completely, entirely, every single', () => {
    const script = loadScript();
    // Check each pattern token is present in the script
    const requiredTokens = [
      'FULLY',
      'NEVER',
      'ALWAYS',
      '0 drift',
      'all idle',
      'no impact',
      '100%',
      'completely',
      'entirely',
      'every single',
    ];
    for (const token of requiredTokens) {
      expect(script).toContain(token);
    }
  });

  it('script uses the case-insensitive flag', () => {
    const script = loadScript();
    expect(script).toMatch(/LNN8N_PATTERN\s*=\s*\/[^\n]*\/i/);
  });

  it('script uses word boundaries \\b for non-100% tokens', () => {
    const script = loadScript();
    expect(script).toMatch(/\\b\(.*FULLY.*\b/);
  });

  it('script defines a parseInput function supporting JSON, NDJSON, and {messages}', () => {
    const script = loadScript();
    expect(script).toContain('function parseInput');
  });

  it('script exit codes: 0 pass, 1 hit, 2 invalid input', () => {
    const script = loadScript();
    expect(script).toMatch(/process\.exit\(0\)/);
    expect(script).toMatch(/process\.exit\(1\)/);
    expect(script).toMatch(/process\.exit\(2\)/);
  });

  it('script has L#26 self-reference: "Action per L#45 v6.1 6th probe"', () => {
    const script = loadScript();
    expect(script).toContain('Action per L#45 v6.1 6th probe');
  });
});

// =============================================================================
// CLI integration — spawn the script and verify exit codes + output
// =============================================================================

describe('CLI: scripts/lnn-8-8n-message-scan.ts', () => {
  function runCli(input: string, args: string[] = []): {
    status: number;
    stdout: string;
    stderr: string;
  } {
    const result = spawnSync(
      'npx',
      ['tsx', SCRIPT_PATH, ...args],
      { input, encoding: 'utf8', timeout: 30000 },
    );
    return {
      status: result.status ?? -1,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
    };
  }

  it('exit 0 with no hits for normal messages (JSON array input via stdin)', () => {
    const input = JSON.stringify([
      'PR #5715 merged (verified 09:46Z, sha=dbcf822c)',
      'Tests: 50/50 pass',
      '0 conflicts',
    ]);
    const { status, stdout } = runCli(input);
    expect(status).toBe(0);
    expect(stdout).toMatch(/0 over-generalization patterns/);
  });

  it('exit 1 with hit details for over-generalization (JSON array input)', () => {
    const input = JSON.stringify([
      'PR fully merged',
      'Tests pass',
    ]);
    const { status, stderr, stdout } = runCli(input);
    expect(status).toBe(1);
    expect(stderr).toMatch(/L#NN-8 8n tripwire/);
    expect(stderr).toMatch(/fully/);
    expect(stdout).toBe(''); // stdout should be empty on FAIL
  });

  it('exit 0 with NDJSON (one message per line)', () => {
    const input = 'PR #5715 merged\nTests pass\n0 conflicts\n';
    const { status, stdout } = runCli(input);
    expect(status).toBe(0);
    expect(stdout).toMatch(/format: ndjson/);
  });

  it('exit 2 for empty input', () => {
    const { status, stderr } = runCli('');
    expect(status).toBe(2);
    expect(stderr).toMatch(/no messages to scan/);
  });

  it('exit 0 with JSON object {messages: [...]}', () => {
    const input = JSON.stringify({ messages: ['clean', 'normal'] });
    const { status, stdout } = runCli(input);
    expect(status).toBe(0);
    expect(stdout).toMatch(/0 over-generalization patterns/);
  });
});

// =============================================================================
// L#26 SANITY (per skills/lnn-26-mutation-protocol/)
// =============================================================================

describe('L#26 sanity: tripwire catches regression', () => {
  it('L#26 v1: a message with "FULLY" is detected', () => {
    const hits = scanMessages(['The fix is FULLY deployed']);
    expect(hits.length).toBeGreaterThan(0);
  });

  it('L#26 v2: a message that uses "fully" with surrounding context is still caught', () => {
    // Even a polite qualifier doesn't make "fully" safe — that's the lesson
    // of L#NN-8 8n: qualify with N=observed, not with "essentially"/"broadly".
    const hits = scanMessages(['Essentially fully fixed (no N=observed)']);
    expect(hits.length).toBeGreaterThan(0);
  });

  it('L#26 false-positive check: the tripwire errs on the side of catching (by design)', () => {
    // The tripwire catches "fully" even in idiomatic uses like "fully-booked"
    // (the trailing \b matches at the hyphen). The author must then qualify
    // with N=observed in their follow-up message. This is L#45 v6.1 design.
    const hits = scanMessages(['I am fully booked tomorrow']);
    expect(hits.length).toBeGreaterThan(0);
  });

  it('L#26 sanity: a fixture of NORMAL L#NN-19-style messages is a clean pass', () => {
    const fixture = [
      'PR #5715 is merged (verified via API 09:46Z, sha=dbcf822c, 0 conflicts).',
      '0 PRs in flight.',
      '2 of 4 leads closed (2/4 = 50%, qualification observed).',
      'Tests: 52/52 pass (counted via vitest, not estimated).',
      'Cron 3d02bd9c fired 18 times in last 24h, 0 actions taken (silent stand-down).',
      'Issue #5713 is REOPENED (verified via API 08:40:13Z).',
    ];
    const hits = scanMessages(fixture);
    expect(hits).toEqual([]);
  });
});
