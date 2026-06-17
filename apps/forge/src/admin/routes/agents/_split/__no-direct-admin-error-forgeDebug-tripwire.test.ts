/**
 * L#NN-50 tripwire (regression for #5457): _split/*.ts files must NOT
 * hand-roll the admin route error pattern (forgeDebug({ scope: 'admin',
 * level: 'error' ... }) + jsonResponse 500). Use adminRouteError helper instead.
 *
 * Tripwire: scan all admin/routes/agents/_split/*.ts files (excluding test
 * and tripwire files) for direct forgeDebug({ scope: 'admin', level: 'error'
 * patterns within a 5-line window. If found, fail with file path and line.
 */
import { describe, expect, it } from 'vitest';
import { findSourceFiles, readSource } from '../../../../tripwire-helpers';

/**
 * Find lines that begin a forgeDebug({ call followed within 5 lines by
 * both scope: 'admin' and level: 'error'. Returns 1-indexed line numbers.
 */
function findHandRolledAdminError(src: string): number[] {
  const lines = src.split('\n');
  const violations: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('forgeDebug(')) {
      const window = lines.slice(i, Math.min(i + 5, lines.length)).join('\n');
      if (window.includes("scope: 'admin'") && window.includes("level: 'error'")) {
        violations.push(i + 1);
      }
    }
  }
  return violations;
}

describe('no hand-rolled admin-error forgeDebug in _split/ (regression for #5457)', () => {
  const files = findSourceFiles(__dirname);

  it('_split/ contains 7 non-test source files (sanity)', () => {
    expect(files).toHaveLength(7);
  });

  for (const filepath of files) {
    const filename = filepath.split('/').pop() ?? filepath;
    it(filename + ' must use adminRouteError instead of hand-rolled forgeDebug', () => {
      const src = readSource(filepath);
      const violations = findHandRolledAdminError(src);
      expect(
        violations,
        'Found hand-rolled forgeDebug({ scope: \'admin\', level: \'error\' ... }) in ' + filename + ' at line(s): ' + violations.join(', ') + '. Use adminRouteError helper instead.',
      ).toEqual([]);
    });
  }
});
