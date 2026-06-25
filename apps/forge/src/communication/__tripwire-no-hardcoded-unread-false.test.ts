/**
 * Tripwire: catch hardcoded `unread: false` in communication/* message-retrieval functions.
 *
 * L#NN-50 #19 v3 (silent-failure pattern) + L#NN-32 v6 EXTENSION (premature close detection).
 *
 * Root cause: `getMessagesByAccount` in `internal-chat-messages.ts` silently always
 * returned `unread: false` regardless of read state. Issue #6037 closed prematurely
 * via PR #6063, bug 2 was deferred but never filed separately. Filed as #6090,
 * fixed via this PR.
 *
 * Codification: any function in `communication/*` that returns `CommunicationProviderMessage[]`
 * MUST compute unread via the `internalChatMessageReads` JOIN pattern (same as
 * `getMessages` in internal-chat-messages.ts:108). A literal `unread: false` in the
 * return-shape map is a silent-failure bug.
 *
 * Tripwire detection:
 *   1. `unread: false` literal in source — flag as suspicious
 *   2. Allow-list per-file for KNOWN tracked violations (must be filed as issue)
 *
 * Pattern exemption: false positives OK if the source explicitly maps from row data
 * (e.g., `unread: row.unread === 1`). Tripwire allows patterns like `unread: X === 1`
 * where X is not literally `false`.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const COMMUNICATION_DIR = path.join(__dirname);

// Allowlist of files with KNOWN tracked violations. Each entry must have an issue reference.
// Add an entry ONLY when the issue is filed and the fix is scoped but deferred to a separate PR.
const ALLOWLIST: ReadonlyArray<{ file: string; reason: string; trackedIssue: number }> = [
  {
    file: 'internal-chat-conversations-listing.ts',
    reason: 'listConversationsByAccount hardcoded unread:false — separate bug class (conversation-level, not message-level). Tracked separately because it requires a different fix shape (accountId→agentId mapping at conversation level + correct unreadCount aggregation).',
    trackedIssue: 6038,
  },
];

function findTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findTsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !entry.name.startsWith('__tripwire')) {
      results.push(full);
    }
  }
  return results;
}

describe('communication/* — no hardcoded unread:false in message-retrieval (L#NN-50 #19 v3, issue #6090)', () => {
  const files = findTsFiles(COMMUNICATION_DIR);

  it('scans at least 1 communication file (sanity)', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('allowlist entries reference tracked issues', () => {
    for (const entry of ALLOWLIST) {
      expect(entry.trackedIssue).toBeGreaterThan(0);
      expect(entry.reason).toMatch(/tracked|deferred|separate|known/i);
    }
  });

  for (const file of files) {
    const rel = path.relative(__dirname, file);
    const isAllowed = ALLOWLIST.some((entry) => rel.endsWith(entry.file));
    if (isAllowed) continue;

    const source = fs.readFileSync(file, 'utf8');

    // Pattern: `unread: false,` — literal false assignment
    const matches = [...source.matchAll(/(\s|\()unread:\s*false(\s*,|\s*\}|;)/g)];

    if (matches.length === 0) continue;

    it(`${rel}: no hardcoded unread:false (L#NN-50 #19 v3 violation)`, () => {
      expect.soft(matches, `${rel} contains ${matches.length} hardcoded 'unread: false' literal(s). Fix: compute unread via internalChatMessageReads JOIN (pattern: getMessages in internal-chat-messages.ts:108).`).toHaveLength(0);
    });
  }
});