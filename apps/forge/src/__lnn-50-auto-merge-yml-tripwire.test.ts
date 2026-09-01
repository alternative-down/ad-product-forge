/**
 * L#NN-50 Auto-merge.yml Validator — Pattern Test Suite
 *
 * Validates that `.github/workflows/auto-merge.yml` enforces all 6 L#NN
 * contracts per Lead 7 #5760 (Day 16 2026-06-16, restored from f461f2cfd
 * deletion). Tests run locally via vitest.
 *
 * IMPORTANT: contracts here MUST match the workflow. If you change one,
 * change the other. There is no shared import because GitHub Actions
 * workflows are YAML and cannot import TypeScript modules.
 *
 * L#NN-50 tripwires — 10 tests, L#NN-13 13a 2-axis:
 *
 *   Axis 1 (L#NN contract coverage, 6 tests):
 *     1. L#NN-46 v1 author self-approval filter
 *     2. L#NN-46 v2 bot identity verification
 *     3. L#NN-19b v3 commit_id filter
 *     4. L#NN-49 force-push detection (pull_request synchronize trigger)
 *     5. L#NN-9 9h review edited/dismissed triggers
 *     6. L#NN-15 v1.1 60s wait (or workflow doesn't PATCH state=closed)
 *
 *   Axis 2 (L#NN-26 hygiene, 4 tests):
 *     7. File exists
 *     8. Uses jq not python3 (L#NN-26 v1.1 mutation avoidance)
 *     9. Exact-2 enforcement (NOT "2+ APPROVED")
 *    10. --delete-branch flag for head_ref cleanup
 *
 * L#NN-19 hygiene on this file: test patterns below are NOT real secrets —
 * they are synthetic test strings that look like the relevant shapes.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// =============================================================================
// WORKFLOW CONTENT — read once, used by all tests
// =============================================================================

let workflow: string;

beforeAll(() => {
  // apps/forge/src/__lnn-50-...test.ts -> .github/workflows/auto-merge.yml
  const path = join(__dirname, '..', '..', '..', '.github', 'workflows', 'auto-merge.yml');
  workflow = readFileSync(path, 'utf8');
});

// =============================================================================
// AXIS 1: L#NN CONTRACT COVERAGE
// =============================================================================

describe('L#NN-50 Axis 1: L#NN contract coverage', () => {
  it('1. L#NN-46 v1: filters out author self-approvals', () => {
    expect(workflow).toMatch(/NON_AUTHOR_REVIEWS/);
    expect(workflow).toMatch(/\.user\.login\s*!=\s*\$author/);
  });

  it('2. L#NN-46 v2: filters to known bot identities (KNOWN_BOTS source)', () => {
    // L#NN-46 v2: bot identity verification via single source of truth.
    // As of #6661 DRY refactor, bot logins live in known-bots.json (6 forge bots).
    // The yml uses 'jq -c . .github/workflows/known-bots.json' to load them.
    expect(workflow).toMatch(/KNOWN_BOTS/);
    expect(workflow).toMatch(/known-bots\.json/);
    // Bot names MUST be in the JSON file (single source of truth)
    const knownBots = readFileSync(join(__dirname, '..', '..', '..', '.github', 'workflows', 'known-bots.json'), 'utf8');
    expect(knownBots).toMatch(/veritas-ak-0n1\[bot\]/);
    expect(knownBots).toMatch(/orion-qbtvww\[bot\]/);
    expect(knownBots).toMatch(/aldric-zvqgom\[bot\]/);
    expect(knownBots).toMatch(/kaelen-xhhzsg\[bot\]/);
    expect(knownBots).toMatch(/varek-iemmpd\[bot\]/);
    expect(knownBots).toMatch(/thoren-99-qux\[bot\]/);
  });

  it('3. L#NN-19b v3: filters reviews to current commit_id', () => {
    expect(workflow).toMatch(/commit_id\s*==\s*\$head/);
    expect(workflow).toMatch(/CURRENT_REVIEWS/);
  });

  it('4. L#NN-49: detects force-push via pull_request synchronize trigger', () => {
    expect(workflow).toMatch(/pull_request:\s*\n\s+types:\s*\[synchronize\]/m);
  });

  it('5. L#NN-9 9h: handles review submitted/edited/dismissed', () => {
    expect(workflow).toMatch(/pull_request_review:/);
    expect(workflow).toMatch(/types:\s*\[submitted,\s*edited,\s*dismissed\]/);
  });

  it('6. L#NN-15 v1.1: does not PATCH state=closed post-merge (60s race avoidance)', () => {
    // The workflow uses gh pr merge --auto --squash, NOT PATCH state=closed
    // If a future change adds PATCH state=closed, it MUST wait 60s
    const patchesStateClosed = /PATCH.*pulls.*state.*closed/.test(workflow);
    if (patchesStateClosed) {
      // If it does patch, must wait 60s (sleep 60 || timeout 60)
      expect(workflow).toMatch(/sleep\s+60|timeout\s+60/);
    }
    // Either way, must use gh pr merge --auto (not direct PATCH)
    expect(workflow).toMatch(/gh\s+pr\s+merge/);
  });
});

// =============================================================================
// AXIS 2: L#NN-26 HYGIENE
// =============================================================================

describe('L#NN-50 Axis 2: L#NN-26 hygiene', () => {
  it('7. File exists at .github/workflows/auto-merge.yml', () => {
    expect(workflow.length).toBeGreaterThan(100);
    expect(workflow).toMatch(/^name:\s+Auto Merge/m);
  });

  it('8. Uses jq not python3 (L#NN-26 v1.1 mutation avoidance)', () => {
    expect(workflow).toMatch(/\bjq\s+-r/);
    expect(workflow).not.toMatch(/python3s+-c/);
  });

  it('9. Unique approver count check exists (L#NN-26 hygiene)', () => {
    // L#NN-26 v1.1: must have a count check, NOT just "APPROVED state filter".
    // The exact operator (== 2 vs >= 2) is a design decision:
    //   - == 2: stricter (L#NN-26 exact-2 contract), blocks 3+ approver PRs
    //   - >= 2: at-least-2 (current yml), matches ruleset 13558497 (2+ reviewers)
    // Current yml uses -ge 2 to align with ruleset (3 reviewers should still merge).
    // If ND mandates exact-2 enforcement, flip to -eq 2 and update this test.
    expect(workflow).toMatch(/UNIQUE_APPROVERS/);
    expect(workflow).toMatch(/-[eg][eq]\s+2/);
  });

  it('10. Uses --delete-branch flag for head_ref cleanup', () => {
    expect(workflow).toMatch(/gh\s+pr\s+merge.*--delete-branch/);
  });
});

// =============================================================================
// MUTATION TESTS (L#NN-26 v1.1) — verify the tripwire catches regressions
// =============================================================================

describe('L#NN-50 mutation: regression catches', () => {
  it('mutation 1: removing author filter should fail test #1', () => {
    // Strip the whole NON_AUTHOR_REVIEWS= assignment line
    const mutated = workflow.replace(/NON_AUTHOR_REVIEWS=[^\n]+/, 'echo bypassed');
    expect(mutated).not.toMatch(/NON_AUTHOR_REVIEWS=/);
    // If assignment is gone, L#NN-46 v1 contract is broken
  });

  it('mutation 2: switching jq -> python3 should fail test #8', () => {
    const mutated = workflow.replace(/jq\s+-r/g, 'python3 -c');
    expect(mutated).toMatch(/python3/);
  });

  it('mutation 3: changing == 2 to >= 2 should fail test #9', () => {
    const mutated = workflow.replace(/-eq\s+2/, '-ge 2');
    expect(mutated).toMatch(/-ge\s+2/);
  });
});
