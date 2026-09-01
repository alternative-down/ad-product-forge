# Issue #6444 Audit: auto-merge.yml KNOWN_BOTS list verification

**Date**: D49 21:25Z  
**Auditor**: Varek (Streak 199, D49 #6444)  
**Base**: 9b77e5b1 (post-Streak 198)

## Summary

Issue #6444 describes a stale state of `.github/workflows/auto-merge.yml` KNOWN_BOTS list. Pre-flight verification (per L#NN-Verify-Before-Dispatch v1) reveals the issue is **already resolved** by PR #6448 (commit 44306cd7) and the proposed fix is **factually incorrect**.

## Pre-flight verification findings

### Current state (verified at 9b77e5b1)

`.github/workflows/auto-merge.yml:65`:
```yaml
KNOWN_BOTS='["veritas-ak-0n1", "orion-qbtvww", "aldric-zvqgom", "kaelen-xhhzsg", "varek-iemmpd"]'
```

All 5 forge bot logins are present.

### Claim from #6444 body

> KNOWN_BOTS list has STALE logins (veritas-ak-0n1 was old; current is veritas-259zs5)

### Empirical evidence (verified via GitHub API)

5 most recent merged PRs (6544, 6543, 6542, 6540, 6539) — all have Veritas reviews from `veritas-ak-0n1[bot]`. The veritas-259zs5 login does NOT exist in the workspace's recent activity.

**Conclusion**: `veritas-ak-0n1` IS the current Veritas bot. The issue's claim that `veritas-ak-0n1` is stale and `veritas-259zs5` is current is **factually wrong**. Applying the proposed fix would BREAK auto-merge by removing the actual current veritas login.

### Related fix history

- **PR #6448** (commit `44306cd7`, merged): "chore(ci): include all 5 forge bots in auto-merge KNOWN_BOTS (fixes #6441)" — already added aldric, kaelen, varek to KNOWN_BOTS
- **#6441** (sister issue): same root cause, closed by PR #6448
- **#6444** (this issue): describes same root cause but adds incorrect veritas login change

## Conclusion

Issue #6444 is **obsolete**:
1. The 3 missing bot logins (aldric, kaelen, varek) are already present (PR #6448)
2. The proposed veritas login change is factually wrong (veritas-ak-0n1 is current)
3. No code change required

## Recommendation

Close #6444 as "already resolved / duplicate of #6441 / contains factually incorrect information".

## L#NN codifications

- **L#NN-Stale-Issue-Worktree-Drift v1 N=1 → N=3 EMPIRICAL** (D49 c12 codified, c13 + c14 confirmed twice in one D49)
- **L#NN-Verify-Before-Dispatch v1 N=1 EMPIRICAL** (D49 c11): pre-flight verification prevents wrong-state changes
- **L#NN-Audit-Document-Close-Pattern v1 N=1 → N=2 EMPIRICAL** (D49 c12 codified, c14 second use)

## Cross-references

- Pre-flight pattern: Streak 197 (D49 #6494 audit doc) — first audit-only verification PR
- This document: Streak 199 (D49 #6444) — second audit-only verification PR
- Workflow file: `.github/workflows/auto-merge.yml:65` (verified correct, no change needed)
