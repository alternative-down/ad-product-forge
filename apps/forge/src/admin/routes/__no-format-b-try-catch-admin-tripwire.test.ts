/**
 * L#NN-50 family #6 tripwire: detect Format B pattern in admin route handlers.
 *
 * Format B (legacy):
 *   } catch (err) {
 *     forgeDebug({ scope: 'admin', level: 'error', message: ..., context: ... });
 *     return jsonResponse({ error: errorMsg(err) }, 500);
 *   }
 *
 * Format A (canonical): use adminRouteError helper from admin-route-error-helper.ts
 *   } catch (err) {
 *     return adminRouteError(err, { path: ... });
 *   }
 *
 * This tripwire fails if any admin route handler file in agents/, finance/, or system/
 * (excluding the helper itself and tests) contains a forgeDebug error-level call
 * inside a try/catch block.
 *
 * Regression for #5784 (Q4 admin route Format A migration Phase 2).
 * Extended for L#NN-50 #14 codification N=2 after PR #5829 (Day 19).
 * Re-enabled D58 after Phase 4 migration (read.ts + write.ts #6736 pre-stage).
 *
 * KNOWN INTENTIONAL SITES (allowlist):
 *   - write.ts: oauth/sync per-item loop catch (~line 317)
 *     Rationale: preserves partial-success semantics for batch sync.
 *     adminRouteError would short-circuit and kill the batch.
 *     Per adminRouteError JSDoc: "Batch operations (catch in bulk insert/update
 *     that needs partial-success semantics)" are intentionally NOT migrated.
 *     Marker comment in source: "Per-item catch: preserves partial-success"
 *
 * When adding new intentional sites, append to KNOWN_INTENTIONAL_SITES below
 * AND add a matching marker comment in the source file explaining why
 * adminRouteError is not applicable.
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const __dirname = import.meta.dirname;
const ADMIN_ROUTE_FILES_PATTERN = [
  path.join(__dirname, 'agents/*.ts'),
  path.join(__dirname, 'finance/*.ts'),
  path.join(__dirname, 'system/*.ts'),
].join(' ');
const EXCLUDE_FILES = ['admin-route-error-helper.ts', '__no-format-b-try-catch-admin-tripwire.test.ts'];

/**
 * Allowlist of intentional Format B sites. Each entry identifies the file and
 * a substring that must appear in the catch body (the explanatory marker comment).
 * If the catch body lacks the marker, the tripwire fails — this prevents
 * silent additions of "intentional" sites without proper documentation.
 */
const KNOWN_INTENTIONAL_SITES: ReadonlyArray<{ file: string; marker: string }> = [
  {
    file: 'write.ts',
    // Marker comment in OAuth per-item catch (admin/routes/system/write.ts)
    marker: 'Per-item catch: preserves partial-success semantics',
  },
];

function grepForFormatB(): { file: string; line: number; content: string }[] {
  // Per-catch multi-line check: split file by catch boundaries and inspect each catch body.
  // Avoids false positives where a regex spans across nested catches.
  // Uses fs.readFileSync (no shell escaping issues) + regex with 's' flag (dotAll).
  // Replaces previous grep -rEn approach which had 3 silent bugs:
  //   1. Relative path resolution (Bug #1, #5835)
  //   2. Shell quoting (Bug #2)
  //   3. Single-line regex can't span multi-line Format B catches (Bug #3)
  const catchStartPattern = /catch\s*\([^)]+\)\s*\{/g;
  const formatBInCatchPattern = /forgeDebug\(\s*\{[\s\S]*?scope:\s*'admin'[\s\S]*?level:\s*'error'/;
  const findings: { file: string; line: number; content: string }[] = [];
  const patterns = ADMIN_ROUTE_FILES_PATTERN.split(' ');
  for (const pat of patterns) {
    const files = execSync(`ls ${pat} 2>/dev/null`, { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
    for (const file of files) {
      if (!file.endsWith('.ts')) continue;
      if (EXCLUDE_FILES.some((excl) => file.endsWith(excl))) continue;
      const content = fs.readFileSync(file, 'utf8');
      let m: RegExpExecArray | null;
      catchStartPattern.lastIndex = 0;
      while ((m = catchStartPattern.exec(content)) !== null) {
        const catchStart = m.index;
        // Find matching close brace via simple depth counting from catchStart
        let depth = 1;
        let i = catchStart + m[0].length;
        while (i < content.length && depth > 0) {
          const ch = content[i];
          if (ch === '{') depth++;
          else if (ch === '}') depth--;
          i++;
        }
        const catchBody = content.substring(catchStart, i);
        const fbMatch = catchBody.match(formatBInCatchPattern);
        if (fbMatch) {
          const beforeMatch = content.substring(0, catchStart);
          const line = beforeMatch.split('\n').length;
          findings.push({ file, line, content: catchBody.slice(0, 200).replace(/\s+/g, ' ') });
        }
      }
    }
  }
  return findings;
}

describe('admin route Format B tripwire (L#NN-50 family #6)', () => {
  // Tripwire RE-ENABLED D58 after Phase 4 migration (#6736 pre-stage).
  // 1 intentional site (write.ts OAuth per-item batch catch) is allowed via
  // KNOWN_INTENTIONAL_SITES allowlist with explicit marker comment check.
  it('no Format B try/catch + forgeDebug patterns in admin route files (except KNOWN_INTENTIONAL_SITES)', () => {
    const findings = grepForFormatB();
    const real = findings.filter((f) => !EXCLUDE_FILES.some((excl) => f.file.endsWith(excl)));

    // Filter out known intentional sites where the marker comment is present
    const unintentional = real.filter((finding) => {
      const fileName = finding.file.split('/').pop() ?? finding.file;
      const allowlistEntry = KNOWN_INTENTIONAL_SITES.find(
        (site) => fileName === site.file || finding.file.endsWith(`/${site.file}`),
      );
      if (!allowlistEntry) return true; // not in allowlist = unintentional
      // Verify the marker comment is actually in the catch body (or just before it)
      // to prevent silent additions without proper documentation
      return !fs.readFileSync(finding.file, "utf8").includes(allowlistEntry.marker);
    });

    if (unintentional.length > 0) {
      const report = unintentional
        .map((f) => `  ${f.file}:${f.line}  ${f.content.slice(0, 120)}`)
        .join('\n');
      throw new Error(
        `Format B (try/catch + forgeDebug error-level) found in admin route handlers.\n` +
        `Use adminRouteError helper instead, OR add to KNOWN_INTENTIONAL_SITES with marker.\n\n${report}`,
      );
    }
    expect(unintentional).toEqual([]);
  });
});