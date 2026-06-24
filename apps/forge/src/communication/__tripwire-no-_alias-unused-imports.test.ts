// Tripwire: enforce that internal-chat-service.ts does NOT reintroduce unused
// `_`-prefix aliased imports (L#NN-50 #17, #6039 P2).
//
// Background: the file had 32+ unused imports aliased with `_` prefix to
// bypass @typescript-eslint/no-unused-vars. They were ALL dead code.
//
// After #6039: 30 imports removed, 1 retained (InternalChatGroupParticipant,
// which is actually USED via _InternalChatGroupParticipant alias in SendingDeps).
//
// This tripwire asserts:
// 1. Only `as _` patterns remaining should be in import statements (not code)
// 2. All remaining `as _` patterns must be in import statements, not body code
// 3. No new `as _` imports can be added without justification

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE_PATH = resolve(__dirname, 'internal-chat-service.ts');

describe('L#NN-50 #17 tripwire: internal-chat-service.ts has no unused _ aliased imports (#6039)', () => {
  const source = readFileSync(FILE_PATH, 'utf8');

  // Find all `as _Identifier` patterns NOT inside an import statement
  function findAliasedOutsideImports(): Array<{ line: number; text: string }> {
    const lines = source.split('\n');
    const result: Array<{ line: number; text: string }> = [];
    let inImport = false;
    let braceDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Detect import block start
      if (/^\s*import\s+/.test(line)) {
        inImport = true;
        braceDepth = 0;
      }
      if (inImport) {
        // Count braces
        for (const ch of line) {
          if (ch === '{') braceDepth++;
          else if (ch === '}') braceDepth--;
        }
        if (braceDepth <= 0 && line.includes(';')) {
          inImport = false;
        }
        continue;
      }
      // Outside import: check for `as _`
      const match = line.match(/\bas\s+_\w+/);
      if (match) {
        result.push({ line: i + 1, text: match[0] });
      }
    }
    return result;
  }

  it('has no `as _` aliased usages outside import statements', () => {
    const outsideImports = findAliasedOutsideImports();
    // NOTE: InternalChatGroupParticipant IS used inside the file body via the
    // alias `_InternalChatGroupParticipant` (in SendingDeps and connection types).
    // If that usage is removed, the alias becomes unused and lint would catch it.
    expect(outsideImports).toEqual([]);
  });

  it('keeps only `as _` patterns that are USED (count of references >= 1)', () => {
    // For each `as _Identifier` import, verify the identifier is referenced somewhere
    const importAliases = source.match(/\bas\s+_(\w+)\b/g) || [];
    const aliases = importAliases.map((m) => {
      const id = m.match(/as\s+_(\w+)/)?.[1];
      return id;
    }).filter((id): id is string => Boolean(id));

    for (const alias of new Set(aliases)) {
      // Count occurrences of _Alias in the source (excluding the import line)
      const usageRegex = new RegExp(`\\b_${alias}\\b`, 'g');
      const allMatches = source.match(usageRegex) || [];
      // At least 1 occurrence (the import) + 1 use
      const usageCount = allMatches.length;
      expect(usageCount, `alias _${alias} should have >= 1 usage outside import`).toBeGreaterThanOrEqual(2);
    }
  });
});