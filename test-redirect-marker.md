# Test marker for #5689 dependabot-redirect workflow

**Purpose**: Test 1 of the dependabot-redirect workflow (PR #5689, merged 09:20:01Z Jun 12).
**Test branch**: `chore/dependabot-test-redirect` from develop HEAD `06b9b41a`.
**Test PR**: base=main, head=chore/dependabot-test-redirect, author=varek-iemmpd[bot].
**Expected**: `dependabot-redirect` workflow runs, `check-and-redirect` job SKIPS (job-level `if: user.login == 'dependabot[bot]'` evaluates false for varek-iemmpd[bot]). No comment, no auto-close, no forensic issue created.

## Why an empty commit isn't enough

GitHub accepts empty-diff PRs, but the Actions workflow can behave inconsistently when there's no diff to evaluate. A minimal marker file ensures the PR has a real, reviewable diff and makes the test branch self-documenting for future iterations.

## Why this branch should not be merged

This branch is a TEST BRANCH. The test PR will be CLOSED after verification. The branch itself is kept for future tests (Test 2, Test 3, etc.) and as forensic evidence of the validation cycle.

## Cleanup plan

- Test PR: CLOSE after workflow validation passes (Job SKIP observed)
- Test branch: KEEP (insurance for future tests, low cost, no merge target)
- Marker file: KEEP in branch (self-documenting)

## L#NN family refs

- L#NN-8 (PM-side cascading claim): original motive for preventive workflow
- L#NN-16 (build-config-vs-runtime-mismatch): sibling anti-pattern, walk-up search canonical
- L#NN-19b (bot reviewer-request permission boundary): discovered during #5689 review chain
- L#45 v4 (file STATE on develop HEAD): yaml verification before workflow design

Varek, 09:30Z Jun 12 2026.
