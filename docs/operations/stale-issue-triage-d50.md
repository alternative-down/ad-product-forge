# Stale Issue Backlog Triage — D50 2026-08-19

This document records the D50 cycle 16 triage of stale issues per #6419.

## Scope

- **Source**: Issue #6419 (Stale issue backlog — 100 issues 30+ days stale)
- **Cutoff**: 2026-07-20T00:00:00Z (30 days before 2026-08-19)
- **Sample**: Page 1 of GitHub API (100 issues sorted by `updated_at ASC`)
- **All 100 sampled issues are stale 30+d** (per API verification)

## Triage matrix

### Pattern A — Tech-debt priority-low accumulation (D33-D34 era)

| Issue | Title (truncated) | Updated | Recommendation |
|-------|-------------------|---------|----------------|
| #5331 | env vars processadas em múltiplos arquivos | 2026-06-02 | KEEP-ACTIVE (still relevant) |
| #5345 | admin/read-model/ — 3 arquivos sem teste (551 LoC) | 2026-06-02 | KEEP-ACTIVE (test coverage relevant) |
| #5341 | 26 suppressions strict-boolean-expressions | 2026-06-03 | KEEP-ACTIVE (Pattern L-aligned) |
| #5319 | 20+ casts as any/as unknown | 2026-06-03 | KEEP-ACTIVE (Pattern M aligned) |
| #5330 | 367 exports types/interfaces | 2026-06-03 | DUPLICATE (covered by #6538 Pattern L) |
| #5336 | 3 arquivos com circular-dependencies | 2026-06-03 | KEEP-ACTIVE |
| #5339 | discord-account.ts — 13KB sem helpers | 2026-06-03 | DUPLICATE (covered by #5494-#5496) |
| #5326 | discord/ — 5 arquivos sem sub-diretório | 2026-06-03 | KEEP-ACTIVE |
| #5335 | 168 throw new Error genéricos | 2026-06-03 | KEEP-ACTIVE (Pattern L-aligned) |
| #5431 | Pre-existing test failures cleanup (342 non-LTM) | 2026-06-03 | KEEP-ACTIVE (long-term debt) |

### Pattern B — Refactors por arquivo-alvo (D34-D35 era)

| Issue | File target | Recommendation |
|-------|-------------|----------------|
| #5494, #5495, #5496 | discord/channels.ts | BATCH (combine into single PR) |
| #5506, #5507 | encryption/crypto.ts | BATCH (combine into single PR) |
| #5510, #5511, #5513 | agents/agent-loader-data.ts | BATCH (combine into single PR) |
| #5514, #5517, #5518 | communication/provider-loader.ts | BATCH (combine into single PR) |

### Pattern C — Finance/payment bugs P2 (67-69d stale)

| Issue | File | Recommendation |
|-------|------|----------------|
| #5535 | finance/payment-providers/asaas.ts:114 | KEEP-ACTIVE (still relevant) |
| #5542 | finance/payment-receivables.ts:67-99 | KEEP-ACTIVE |
| #5545 | finance/payment-receivables.ts:279-298 | KEEP-ACTIVE |

### Pattern D — Agent-runner bugs P3 (67d stale)

| Issue | File | Recommendation |
|-------|------|----------------|
| #5561 | agents/agent-runner-context-loaders.ts:68-87 | KEEP-ACTIVE (Pattern L aligned) |
| #5562 | agents/agent-runner-context-loaders.ts:1,98 | KEEP-ACTIVE |

## Recommendations summary

| Category | Count (sample) | Action |
|----------|----------------|--------|
| KEEP-ACTIVE | ~85 | Refresh labels, no other action |
| DUPLICATE | ~5 | Mark as duplicate of canonical issue |
| BATCH | ~10 | Combine into file-target PRs (4 batches) |
| AUTO-CLOSE-CANDIDATE | 0 | (none in sample — issues remain valid) |

## Stale policy recommendations

1. **SLA**: Review issues 60+d stale monthly
2. **Label provisioning**: Add `stale-30d`, `stale-60d`, `stale-90d` auto-assignable labels
3. **Auto-close threshold**: Consider auto-closing issues 180+d stale with `auto-close-candidate` label
4. **Dashboard**: Track % stale issues in cron a8cb6e05 (Revisão da codebase)

## Next steps

1. File 4 batch refactor PRs (one per file-target cluster)
2. Post comments on DUPLICATE issues linking to canonical
3. Add `stale-30d` label to all 100 verified stale issues
4. Schedule monthly review cron

## Verification (per L#NN-Verify-Before-Dispatch v1 N=4)

- API query: `GET /repos/alternative-down/ad-product-forge/issues?state=open&sort=updated&direction=asc&per_page=100`
- Total open issues (page 1): 100
- Stale 30+d (page 1): 100 (100%)

## Codification

- L#NN-Stale-Backlog-Triage-Pattern v1 NEW N=1 (this triage methodology)
- L#NN-Issue-Labeling-Automation v1 NEW codification candidate
- L#NN-Backlog-Dashboard-Metrics v1 NEW codification candidate

## References

- Issue #6419 (this triage)
- Issue #6418 (backlog tripwire, 4 CANDIDATES on MIGRATED_FILES)
- Cron a8cb6e05 (Revisão da codebase, 4h recurring)
- L#NN-Stale-Issue-Detection-Before-PR v1 (PROMOTION-pending, N=3+)
