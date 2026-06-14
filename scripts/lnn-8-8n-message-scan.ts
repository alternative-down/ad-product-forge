#!/usr/bin/env -S npx tsx
/**
 * L#NN-8 8n tripwire — scan messages for over-generalization patterns.
 *
 * Companion to L#45 v6.1 6th probe (see
 * `skills/lnn-45-recovery-protocol/SKILL.md`). Detects claims that violate
 * the "qualify with N=observed" rule: words/phrases that imply totality
 * (FULLY, NEVER, ALWAYS, etc.) or that are explicitly listed in the L#NN-8 8n
 * pattern.
 *
 * Usage:
 *
 *   # From a JSON file (array of strings or {messages: string[]}):
 *   tsx scripts/lnn-8-8n-message-scan.ts path/to/messages.json
 *
 *   # From stdin:
 *   echo '["ALL clean", "OK"]' | tsx scripts/lnn-8-8n-message-scan.ts
 *
 *   # One message per line (newline-delimited):
 *   printf 'ALL clean\nOK\n' | tsx scripts/lnn-8-8n-message-scan.ts --ndjson
 *
 *   # In a CI pre-merge hook:
 *   #   curl -s .../messages | tsx scripts/lnn-8-8n-message-scan.ts
 *
 * Exit codes:
 *   0 — no L#NN-8 8n patterns found (PASS)
 *   1 — at least one L#NN-8 8n pattern found (FAIL)
 *   2 — invalid input (could not parse, empty, etc.)
 *
 * Output:
 *   stdout: summary line ("0 patterns in N messages" or "FAIL: K patterns")
 *   stderr: per-hit details (one line per hit, only when hits found)
 *
 * L#NN-19 hygiene: the patterns asserted in this file are detection rules,
 * not secrets. The L#NN-19 detector workflow does not scan scripts/ files.
 *
 * Reference: issue #5713 (L#45 v6.1 6th probe codification).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// =============================================================================
// L#NN-8 8n pattern (per L#45 v6.1 6th probe, AGENTS.md, skill lnn-45-recovery-protocol)
// =============================================================================

/**
 * The L#NN-8 8n over-generalization regex. The pattern is case-insensitive and
 * uses word boundaries. Matches:
 *   - FULLY, NEVER, ALWAYS (absolute quantifiers)
 *   - "0 drift" (false stability claim)
 *   - "all idle" (false emptiness claim)
 *   - "no impact" (false non-effect claim)
 *   - "100%", "completely", "entirely", "every single" (totality claims)
 *
 * The pattern is intentionally narrow: it catches the common over-generalization
 * words used in Day 11-12 incidents. It does NOT catch every possible
 * over-generalization — that's the L#NN-8 8n v2 (heuristic for "X is Y" claims
 * without "except"/"but"/"unless"). v2 is in the skill, not this script.
 */
export const LNN8N_PATTERN =
  /\b(FULLY|NEVER|ALWAYS|completely|entirely|every single|0 drift|all idle|no impact)\b|\b100%/i;

// =============================================================================
// TYPES
// =============================================================================

interface Lnn8nHit {
  idx: number;
  pattern: string;
  snippet: string;
}

interface ScanResult {
  total: number;
  hits: Lnn8nHit[];
  parsedAs: 'json-array' | 'ndjson' | 'unknown';
}

// =============================================================================
// SCAN
// =============================================================================

/**
 * Scan a list of messages for L#NN-8 8n over-generalization patterns.
 * Pure function — no I/O, no side effects. Exported for unit testing.
 */
export function scanMessages(messages: string[]): Lnn8nHit[] {
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

/**
 * Parse input string into a list of messages.
 * Supports JSON array, NDJSON, and JSON object with `messages` field.
 */
function parseInput(raw: string): { messages: string[]; format: ScanResult['parsedAs'] } {
  const trimmed = raw.trim();
  if (!trimmed) return { messages: [], format: 'unknown' };

  // Try JSON first
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return { messages: parsed.map(String), format: 'json-array' };
      }
      if (parsed && Array.isArray(parsed.messages)) {
        return { messages: parsed.messages.map(String), format: 'json-array' };
      }
    } catch (_e) {
      // fall through to NDJSON
    }
  }

  // NDJSON: one message per non-empty line
  const lines = trimmed
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);
  if (lines.length > 0) {
    return { messages: lines, format: 'ndjson' };
  }

  return { messages: [], format: 'unknown' };
}

// =============================================================================
// CLI
// =============================================================================

function main(): void {
  const args = process.argv.slice(2);
  const fileArg = args.find(a => !a.startsWith('--'));
  const ndjsonMode = args.includes('--ndjson');

  let raw: string;
  if (fileArg) {
    const filePath = resolve(fileArg);
    try {
      raw = readFileSync(filePath, 'utf8');
    } catch (e) {
      console.error(`Error: could not read file: ${filePath}`);
      console.error((e as Error).message);
      process.exit(2);
    }
  } else {
    raw = readFileSync(0, 'utf8');
  }

  const { messages, format } = parseInput(raw);
  if (messages.length === 0) {
    console.error('Error: no messages to scan (empty input or unparseable format)');
    process.exit(2);
  }

  const hits = scanMessages(messages);

  if (hits.length > 0) {
    console.error(
      `❌ L#NN-8 8n tripwire: ${hits.length} over-generalization pattern(s) in ${messages.length} message(s):`,
    );
    for (const h of hits) {
      console.error(`  [${h.idx}] "${h.pattern}" — ${h.snippet}`);
    }
    console.error('');
    console.error('Action per L#45 v6.1 6th probe:');
    console.error('  1. STOP stand-down');
    console.error('  2. Re-verify claim with API (e.g., curl GET /repos/.../issues/{n})');
    console.error('  3. Qualify claim with N=observed (e.g., "merged (verified 09:46Z, sha=...)")');
    console.error('  4. Re-run script');
    process.exit(1);
  }

  console.log(
    `✅ L#NN-8 8n tripwire: 0 over-generalization patterns in ${messages.length} message(s) (format: ${format}${ndjsonMode ? ', forced NDJSON' : ''}).`,
  );
  process.exit(0);
}

// Run CLI only when executed directly (not when imported for tests)
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
