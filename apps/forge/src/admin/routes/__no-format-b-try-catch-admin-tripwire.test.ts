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
 * This tripwire fails if any admin route handler file (excluding the helper itself
 * and tests) contains a forgeDebug error-level call inside a try/catch block.
 * Regression for #5784 (Q4 admin route Format A migration Phase 2).
 */

import { execSync } from 'node:child_process';
import { describe, it, expect } from 'vitest';

const ADMIN_ROUTE_FILES_PATTERN = 'apps/forge/src/admin/routes/agents/*.ts apps/forge/src/admin/routes/finance/*.ts';
const EXCLUDE_FILES = ['admin-route-error-helper.ts', '__no-format-b-try-catch-admin-tripwire.test.ts'];

function grepForFormatB(): { file: string; line: number; content: string }[] {
  // Multi-line grep: find catch + forgeDebug combo in admin route files.
  // Pattern: catch (err) { ... forgeDebug({ ... scope: 'admin' ... level: 'error' ... }
  // We use a simplified regex that catches the canonical Format B structure.
  const grepPattern = String.raw`catch\s*\([^)]+\)\s*\{[^}]*forgeDebug\(\{[^}]*scope:\s*'admin'[^}]*level:\s*'error'`;
  const cmd = `grep -rEn '${grepPattern}' ${ADMIN_ROUTE_FILES_PATTERN} 2>/dev/null || true`;
  const stdout = execSync(cmd, { encoding: 'utf8' });
  if (!stdout.trim()) return [];
  return stdout.trim().split('\n').map((line) => {
    const match = line.match(/^([^:]+):(\d+):(.*)$/);
    if (!match) return null;
    return { file: match[1], line: parseInt(match[2], 10), content: match[3] };
  }).filter((x): x is { file: string; line: number; content: string } => x !== null);
}

describe('admin route Format B tripwire (L#NN-50 family #6)', () => {
  it('no Format B try/catch + forgeDebug patterns in admin route files', () => {
    const findings = grepForFormatB();
    const real = findings.filter((f) => !EXCLUDE_FILES.some((excl) => f.file.endsWith(excl)));
    if (real.length > 0) {
      const report = real.map((f) => `  ${f.file}:${f.line}  ${f.content.slice(0, 100)}`).join('\n');
      throw new Error(
        `Format B (try/catch + forgeDebug error-level) found in admin route handlers.\n` +
        `Use adminRouteError helper instead.\n\n${report}`,
      );
    }
    expect(real).toEqual([]);
  });
});
