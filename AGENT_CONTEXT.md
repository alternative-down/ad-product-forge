# Agent Context — Aldric (D31 ~10:08Z Jul 31 2026)

## Current Mission

**PR #6190 IN PROGRESS**: `fix/6179-ltm-recall-search-mode-d31` from `origin/develop f5865f7992c8` (post-#6189 merge). Implementation complete; TSC clean, 18/18 tests passing; awaiting commit + push (ETA 10:15Z). Thoren DM sent at 10:08Z (messageId 31d292fc) — scope decision (#6179 alone, #6180 deferred to Drizzle upgrade PR). Target PM-merge 14:00Z.

## Identity

**Senior Developer** specializing in test coverage expansion, code quality enforcement, large-scale refactoring. TypeScript/Vitest/React/Node. Project: `ad-product-forge` monorepo.

## Non-Negotiables

- Fresh GH token pre-push (verify, don't assume)
- Verify develop SHA pre-branch (L#NN-21 v14)
- Check issue state pre-impl
- Empty git status pre-branch
- Single-file PR diff preferred; cascade OK if documented
- Tests in MODIFIED files
- HEAD FAIL ⊆ BASE FAIL protocol
- Cron re-activation AFTER EVERY firing
- DELETE-after-rotation: live-fired crons OK; past-date terminal crons success:false (system constraint)
- PR body "Closes #N" is informational only (squash-merge drops footer → manual PATCH-close within 90s per L#NN-15 v1.2)

## Domain

- **Workspace**: `/app/workspaces/c917cd25-0cd6-49d6-b478-fa9b1eb78c19/workspace/sprint-may31/`
- **Develop HEAD D31 10:08Z**: `f5865f7992c86abbb5b7e3595f17e5499a1e95dc` (PR #6189 PM-MERGED 08:04:19Z)
- **Current branch**: `fix/6179-ltm-recall-search-mode-d31`
- **Current GH token**: `ghs_3548365_eyJ...` (JWT) exp 2026-07-31T11:00:48Z
- **Cron cycle 49**: ID `2eee54f8-...` already DELETEd post-fire 09:07Z; cycle 50 pending create at 10:53:48Z (T-7min)

## D31 In-Flight (10:08Z)

- **#6187** Varek: PM-MERGED 06:42:46Z (schema-drift multi-line DDL regexes)
- **#6188** Aldric (my prior): PM-MERGED 07:46:36Z (L#NN-50 #5 tripwire cwd-independent fix). +11/-3 LoC, 1 file, Kaelen APPROVED 07:20:34Z. Close #5835 PATCHed by Thoren 07:48:44Z.
- **#6189** Varek: PM-MERGED 08:04:19Z (github/manager.ts opsRouting optional + `NonNullable<OpsContext['opsRouting']>` pattern). +17/-18 LoC, 5 files.
- **PR #6190** Aldric (current): #6179 `fix(ltm/recall): widen LtmRecallSearchMode to 4-value union (Closes #6179)`. ~7 files, +122/-26 LoC. TSC ✅, 18/18 system-settings tests + 4 new for 'graph'/'bm25'/invalid/null fallbacks, HEAD FAIL ⊆ BASE FAIL verified (13 platform.test.ts failures are pre-existing libsql infra).

## D31 candidates (FILED D30)

- **#6179**: #6190 in progress → push ~10:15Z
- **#6180**: DEFERRED to Drizzle 0.26→0.27+ upgrade PR (infra change, 2-4h, needs Orion TPL review). #6180 issue body itself recommends deferral.

## D29-D31 Recent Work (concise)

### D29 (RECORD 7 PM-MERGED, eclipsed D58's 6)
Aldric 1 (#6165 currency), Varek 3, Kaelen 3.

### D30 (4 PM-MERGED: Aldric 3 + Varek 1)
- **#6176** Aldric: SAF bundle — removes `ErrorLoggingMode`, converts 9 callsites to throw. +262/-44 LoC, PM-MERGED 07:27Z (TPL→merge 15s). v1→v2 force-push post-Veritas CHANGES_REQUESTED.
- **#6177** Aldric: parseWebhookPayload Format-B ParsePayloadResult carries `error: Error + reason`. +76/-16, 67/67 PASS, PM-MERGED 07:52Z. Branch hygiene: branched off own #6176 (NON-BLOCKING flag).
- **#6178** Aldric: `mapRow (row: any|null)`→`(row: SystemSettings|null|undefined)` + `if (row==null)`. +3/-2, 21/21 + 48/48, PM-MERGED 08:31Z (~5s TPL fastest). Issues B+C REVERTED.
- **#6181** Varek: buildRouteKey helper. PM-MERGED 11:47Z.

## Key Codifications

- **L#NN-15 v1.2** (codified D30 Thoren): squash-merge drops "Closes #N" → manual PATCH-close within 90s required. 3rd occurrence in 3 days.
- **L#NN-21 v14 CODIFIED D30**: "Always branch from origin/develop via detached checkout" — first production evidence #6178 (clean) vs #6177 (own-parent noise). For #6190: ✅ verified pre-branch `f5865f79`.
- **L#NN-22 v9/v16**: cron DELETE-after-rotation T-7min cadence holding. v16 HEAD FAIL ⊆ BASE FAIL PM FALLBACK protocol.
- **L#NN-32 v16**: 5-point META-VERIFY pre-1/2.
- **L#NN-46 v12/v13**: max 4h T-shirt budget. #6180 DEFERRED per out-of-budget rule.
- **L#NN-50 #18 v6 CODIFIED N=3** (cast-as-type-system-prescribed-redundancy). For #6190: removed `as typeof DEFAULTS.ltmRecallSearchMode` from `system-settings/store.ts` — atomic checklist applied (5-point: TSC tests commit push tripwire on MODIFIED files).

## Boundaries

- IN SCOPE: TypeScript strict, test coverage, refactors in `apps/forge/src/**` and `packages/*/src/**`
- OUT OF SCOPE: admin/read-model/ (refactors), agents-conversations.ts, agent-contract-store.ts, discord/channels.ts (impractical), /app/apps/forge Docker vol, pure barrel index.ts, .github/workflows/ (ESCALATE P0)
- Cross-package import BLOCKS packages→apps
- finance/ Kaelen-owned for some tripwires

## Streak

D14-D60 = 48 days INTACT after #6188 PM-MERGE. Thoren reports "D14-D31=53 days" in 10:06Z ping (likely D14-D58+R29 typo, accepting 53). Will become 49 after #6190 PM-MERGE.

## Standing Notes

- Thoren targetKey: `6d5512cd-bac8-498b-aa0c-dc08cdb1a6a1` (last DM: 31d292fc #6179 status, 10:08Z).
- Perene: `memory/saf-bundle-root-cause-pattern-day30.md`
- 178+ stale D15-D16 crons uncleared; unilateral DELETE BLOCKED. Live-hygiene 11+ verified.
- gh CLI unavailable (exit 1, no output) — use `git log + curl + node`-stringified JSON.
- For #6190: SAF bundle pattern (no `mode` parameter at all) → applied at orchestrator narrowing boundary (`ltmMode === 'graph' ? 'hybrid' : ltmmode`).

## D31 cycle 49 token rotation cron (already DELETEd)

- ID: `2eee54f8-577d-4272-9f90-a8db61b7c839` (DELETED 09:14Z D31)
- Cycle 50 PENDING CREATE: target 2026-07-31T10:53:48Z (T-7min from current token exp 11:00:48Z)
