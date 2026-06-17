/**
 * Tripwire (regression for #5536): each forgeDebug message in
 * company-cash-operations.ts must use the function name that contains
 * the call, not a copy-pasted name from a sibling function.
 *
 * The original bug: `postPlannedEntry` had a forgeDebug message that said
 * `cancelPlannedEntry: entry not found` — a copy-paste from the sibling
 * `cancelPlannedEntry` function. Production logs were misleading on-call
 * engineers.
 *
 * The check walks the file, finds all `async function NAME` declarations
 * and all `forgeDebug({...message: 'NAME: ...'...})` calls, and asserts
 * that every forgeDebug call's message prefix is declared as a function
 * in the same file. (The prefix is the substring before the first `:` in
 * the message string, stripped of the leading whitespace.)
 *
 * Static source-level check (readFileSync) per L#NN-13 13a.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const TARGET = join(__dirname, 'company-cash-operations.ts');

describe('L#NN-50 tripwire — company-cash-operations forgeDebug message hygiene (#5536)', () => {
  const src = readFileSync(TARGET, 'utf8');

  it('target file exists and is non-empty (sanity)', () => {
    expect(src.length).toBeGreaterThan(0);
  });

  it('file declares the expected top-level functions (sanity)', () => {
    expect(src).toMatch(/async function postPlannedEntry\s*\(/);
    expect(src).toMatch(/async function cancelPlannedEntry\s*\(/);
  });

  /**
   * Extracts all `function NAME` and `async function NAME` declarations
   * in the file.
   */
  function declaredFunctionNames(source: string): Set<string> {
    const out = new Set<string>();
    const re = /(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      if (m[1]) out.add(m[1]);
    }
    return out;
  }

  /**
   * Extracts every forgeDebug message string in the file. Returns the
   * list of (message, prefix-before-colon) tuples.
   */
  function forgeDebugMessages(source: string): Array<{ message: string; prefix: string | null }> {
    const out: Array<{ message: string; prefix: string | null }> = [];
    // Match message: '<text>' or message: "<text>"
    const re = /message:\s*['"]([^'"]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      const message = m[1] ?? '';
      const colonIdx = message.indexOf(':');
      const prefix = colonIdx > 0 ? message.substring(0, colonIdx).trim() : null;
      out.push({ message, prefix });
    }
    return out;
  }

  it('every forgeDebug message prefix is a declared function in this file', () => {
    const declared = declaredFunctionNames(src);
    const messages = forgeDebugMessages(src);

    // The file must have at least 2 forgeDebug calls (one per function)
    expect(messages.length).toBeGreaterThanOrEqual(2);

    const declaredList = Array.from(declared);
    for (const { message, prefix } of messages) {
      if (prefix === null) continue; // skip messages without a colon prefix
      // Skip messages that are clearly generic (e.g. 'register: failed to schedule')
      // that are still expected to have a function-like prefix. We require that
      // any prefix be a declared function name in this file.
      expect(
        declaredList,
        `forgeDebug message "${message}" has prefix "${prefix}" but no matching function declaration in ${TARGET}`,
      ).toContain(prefix);
    }
  });

  it('regression: postPlannedEntry forgeDebug message is NOT cancelPlannedEntry (#5536)', () => {
    // Pin the specific bug: the original copy-paste used cancelPlannedEntry
    // as the message prefix in the postPlannedEntry function. Walk the file
    // and ensure the substring "cancelPlannedEntry: entry not found" does
    // not appear inside the postPlannedEntry function body.
    const postIdx = src.indexOf('async function postPlannedEntry');
    expect(postIdx).toBeGreaterThanOrEqual(0);
    // Find the next function declaration after postPlannedEntry starts.
    const afterPost = src.substring(postIdx);
    const nextFnMatch = afterPost.match(/\n\s*(?:async\s+)?function\s+[A-Za-z_]/);
    const postEnd = nextFnMatch && nextFnMatch.index !== undefined ? postIdx + nextFnMatch.index : src.length;
    const postBody = src.substring(postIdx, postEnd);

    expect(postBody).not.toMatch(/message:\s*['"]cancelPlannedEntry:/);
    expect(postBody).toMatch(/message:\s*['"]postPlannedEntry:/);
  });
});
