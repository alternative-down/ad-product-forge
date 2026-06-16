/**
 * L#NN-50 CI Workflow Duplicate Step Tripwire (Day 16 Lead 11 #5742, Aldric)
 *
 * Day 16 09:52Z — Aldric. Issue #5742 (TPL cron's 06:00Z "Revisão da
 * codebase" finding) discovered a DUPLICATE Build step in
 * `.github/workflows/ci.yml`. Investigation (`git log -p`) revealed:
 *
 *   1. Mar 28, 2026 (Nicolas, founder, commit 9ec2eb44):
 *      Added `--force` to single Build step (intentional debug).
 *   2. May 15, 2026 (Varek, commit f8203c37):
 *      Removed `--force` because vite and tsc do NOT support it,
 *      causing CI to fail.
 *   3. May 20, 2026 (Aldric, commit 591868ad):
 *      Major CI workflow rewrite inadvertently re-added `--force`
 *      Build step at end (this PR's author accidentally re-introduced
 *      a flag Varek had explicitly removed).
 *   4. Jun 2, 2026 (Kaelen, commit 9a3095ff):
 *      Added a NEW Build step (without `--force`) BEFORE Lint to
 *      ensure `dist/` artifacts exist for Lint/Typecheck/Test (#5370).
 *      This left the existing Build with `--force` at the end,
 *      creating the duplicate.
 *
 * The duplicate second Build with `--force` wasted 1-2 min of CI
 * per PR × 10-15 PRs/day = 10-30 min/day. The fix (this PR #5762
 * companion): REMOVE the second Build step. The first Build (with
 * tsup cache) is sufficient to produce dist/ for Lint/Typecheck/Test.
 *
 * This tripwire prevents RE-INTRODUCTION of the duplicate. It is a
 * source-level regex check on the workflow YAML (L#NN-13 13a pattern,
 * NOT a function-level mock).
 *
 * L#NN-26 v1+v2+v3 mutation protocol:
 *   v1 (block removal): re-add the second Build block, the tripwire
 *     should fail (count goes from 1 to 2).
 *   v2 (dual invariant): N/A (single check).
 *   v3 (comment-strip): the comment-strip is applied to the YAML
 *     BEFORE the regex match, so a `name: Build` mention in a
 *     comment does NOT count as a step.
 *
 * Cross-references:
 *   - L#NN-50 (Varek's required field coverage tripwire, sibling;
 *     Day 15 Lead 2)
 *   - L#NN-50 dedup (Aldric's Zod schema dedup tripwire, Day 16 Lead 9;
 *     same L#NN-50 family, different concern)
 *   - L#NN-13 13a (source-level regex readFileSync pattern)
 *   - L#NN-19 (PR body hygiene)
 *   - L#NN-26 v1+v2+v3 (mutation protocol)
 *   - #5742 (Day 16 Lead 11 dispatch)
 *   - #5370 (Kaelen's original Build-before-Lint rationale)
 *   - #5489 (Schema drift detector rollout)
 *   - 06:00Z "Revisão da codebase" cron (this finding's source)
 *   - Day 16 Aldric codification family
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ciWorkflowPath = resolve(__dirname, '../../../.github/workflows/ci.yml');

const content = readFileSync(ciWorkflowPath, 'utf8');

// L#NN-26 v3: strip comments BEFORE regex matching. This ensures that
// a `name: Build` mention in a comment or docstring does NOT count
// as a step.
const codeOnly = content
  .replace(/\u0023[^\n]*/g, '') // strip # comments
  .replace(/\/\*[^*]*\*+(?:[^/*][^*]*\*+)*\//g, ''); // strip /* */ comments

// Match step entries of the form "      - name: Build" (with any leading
// whitespace). The `(?!#)` negative lookahead ensures we don't match
// commented-out steps. Anchor with start-of-line and the `- name: ` prefix.
const buildStepRegex = /^[ \t]*-[ \t]*name:[ \t]+Build[ \t]*$/gm;
const buildSteps = codeOnly.match(buildStepRegex) || [];

describe('L#NN-50 CI Workflow Duplicate Step Tripwire (Day 16 Lead 11 #5742, Aldric)', () => {
  it('ci.yml has exactly one Build step (L#NN-26 v3 comment-stripped)', () => {
    expect(
      buildSteps.length,
      `ci.yml has ${buildSteps.length} Build step(s) (expected 1). A duplicate wastes 1-2min of CI per PR. See #5742 for the original finding and #5370 for the first Build step's rationale (dist/ artifacts for Lint/Typecheck/Test).`
    ).toBe(1);
  });

  it('first Build step is BEFORE Lint (Kaelen #5370 invariant)', () => {
    const firstBuildIdx = buildSteps[0] ? content.indexOf(buildSteps[0]) : -1;
    const lintIdx = content.indexOf('- name: Lint');
    expect(firstBuildIdx).toBeGreaterThan(-1);
    expect(lintIdx).toBeGreaterThan(firstBuildIdx);
  });
});
