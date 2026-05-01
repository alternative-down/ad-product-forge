# Agent Context — Aldric

## Current Mission
- PR #1118 (refactor/1092-remove-working-memory): open, awaiting review
- PR #1115 (test/1067-internal-chat-groups-coverage): open, awaiting review
- PR #1047 (fix/1047-admin-schema-drift): open, awaiting review

## Open PRs
| PR | Branch | Description | Tests | Notes |
|----|--------|-------------|-------|-------|
| #1118 | refactor/1092-remove-working-memory | Remove updateWorkingMemory tool from runtime | 2707/2707 ✅ | Awaiting review |
| #1115 | test/1067-internal-chat-groups-coverage | Add unit tests for internal-chat-groups | 2709/2711 ❌ | 2 pre-existing failures unrelated to this PR |
| #1114 | test/1113-agent-runner-public-interface | Agent-runner public interface tests | ✅ | |
| #1117 | fix/1102-ltm-npe | Prevent NPE in recallFromStep | ✅ | |
| #1116 | fix/1103-migration-logging | Log migration failure instead of swallowing | ✅ | |
| #1047 | fix/1047-admin-schema-drift | Align admin routes/schemas with canonical | ✅ | Awaiting review |

## Test Status
- Pre-existing failure in `develop`: `company-cash-ledger.test.ts` — "getCurrentBalanceUsd sums posted in/out entries correctly" fails even on develop. Not related to any open PR.
- All PRs are green when isolating their changes.

## Next Actions
- [ ] Await review on #1118
- [ ] Await review on #1115 (consider pre-existing failure as known)
- [ ] Await review on #1047

## Recent Work
- PR #1118: Fixed stray `];` syntax error in runtime-agent-session-runtime.ts, fixed 2 test assertions in runtime-agent-session-runtime.test.ts, and committed/pushed. PR created.
- PR #1115: Verified 33 tests pass for internal-chat-groups.test.ts, service tests updated to mock groups module.
- PR #1047: Verified 21 agent-routes tests pass. Schema drift fix: changeAgentRoleSchema (newRole→roleId), upsertAgentProviderSchema (provider/modelId→providerType/credentials), deleteAgentProviderSchema (provider→providerType).

## Coverage Priority Targets
- `runtime-agent-session-generate.ts` — 420 lines, system prompt building, main generate loop. No test file. Key functions: `runRuntimeAgentSessionGenerate`, `buildRuntimeSessionSystemPrompt`, `buildAiSdkToolSet`, `summarizeGenerateRequest`, `summarizeModelMessage`, `appendGenerateDiagnostics`.
- `conversation-runtime-context-formatter.ts` — 66 lines, single export function. Test exists at `packages/forge-runtime-core/src/conversation-runtime-context-formatter.test.ts`.
- `capabilities/store.ts` — 383 lines, 1 export function. No test file.
- `admin/routes/agents/write-ops.ts` — 342 lines, 1 export function. No test file.
- `operational-memory-om.ts` — 90 lines, pure type exports. No test file.
- `agent-config.ts` — type definitions only. Test exists.

## Workspace Notes
- On refactor/1092-remove-working-memory branch
- git credentials: `ghs_VFcUyerTAfFViA65vT5owbdnF2Lpdy2w7snI`
 (fix(1047): restore broken routes.ts and align write-ops.ts with canonical schemas)
