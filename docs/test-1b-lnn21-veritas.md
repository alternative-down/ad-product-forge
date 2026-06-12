# Test 1b — L#NN-21 disambiguation

Trivial file change to test whether dependabot-redirect workflow fires for veritas-ak-0n1[bot] author on base=main PR.

Expected outcome: workflow fires, then `if: github.actor == 'dependabot[bot]'` check fails, workflow concludes "skipped".

Reference: PR #5689 (the workflow), Test PR #5697 (Varek's test, 12+ min no fire), Issue #5699.
