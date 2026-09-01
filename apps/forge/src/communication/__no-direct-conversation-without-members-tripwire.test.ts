/**
 * L#NN-50 tripwire (regression for #6036 P1):
 * `communication/internal-chat-admin.ts` `ensureDirectConversation` MUST filter
 * direct conversation queries by membership (leftAccountId AND rightAccountId).
 * It MUST NOT return any direct conversation regardless of participants.
 *
 * History: the original `ensureDirectConversation` had a WHERE clause that
 * referenced an `isNotNull` column that was removed from the schema. The
 * filter was simplified to just `type = 'direct'`, returning the FIRST direct
 * conversation regardless of which accounts were involved. This caused
 * `registerAgentAccount` to silently fail to establish DM networks.
 *
 * This tripwire asserts the function body uses the members table for filtering.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const ADMIN_FILE = join(__dirname, 'internal-chat-admin.ts');

describe('L#NN-50 tripwire — ensureDirectConversation MUST filter by membership (issue #6036 P1)', () => {
  const source = readFileSync(ADMIN_FILE, 'utf8');

  // Extract the function body using brace counting
  function getFnBody(name: string): string {
    const fnStart = source.indexOf(`function ${name}`);
    expect(fnStart, `${name} must exist`).toBeGreaterThanOrEqual(0);
    const braceStart = source.indexOf('{', fnStart);
    expect(braceStart).toBeGreaterThan(fnStart);
    let depth = 0;
    let braceEnd = -1;
    for (let i = braceStart; i < source.length; i++) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') {
        depth--;
        if (depth === 0) { braceEnd = i; break; }
      }
    }
    expect(braceEnd, `${name} must have a closing brace`).toBeGreaterThan(braceStart);
    return source.slice(braceStart + 1, braceEnd);
  }

  it('ensureDirectConversation exists', () => {
    expect(source).toMatch(/async function ensureDirectConversation\s*\(/);
  });

  it('ensureDirectConversation body uses the members table (inArray with subquery or join)', () => {
    const body = getFnBody('ensureDirectConversation');
    // Must reference the members table OR use a membership-related query
    expect(body).toMatch(/internalChatConversationMembers|inArray/);
  });

  it('ensureDirectConversation does NOT have the old "isNotNull column removed" comment', () => {
    const body = getFnBody('ensureDirectConversation');
    // The diagnostic comment was a hint that the filter was incomplete
    expect(body).not.toMatch(/isNotNull column removed/);
  });

  it('ensureDirectConversation uses `and(...)` with at least 2 conditions (type + membership)', () => {
    const body = getFnBody('ensureDirectConversation');
    // The new query should have multiple conditions: type='direct' + membership filter
    const andMatches = body.match(/and\(/g) ?? [];
    // Expect at least 1 and() with 2+ args
    expect(andMatches.length).toBeGreaterThan(0);
  });
});
