/**
 * L#NN-50 #18 v10 helper-extraction rollout registry.
 *
 * Separated from the rollout-guard test file (D50 #6430) to eliminate the
 * tripwire test as a rebase conflict target during multi-PR helper-extraction
 * cycles. The 39-entry MIGRATED_FILES list (D38-D45) was the #1 cause of
 * cascade rebase loops because each new cycle added an entry to the array,
 * creating contention when 2+ PRs were in flight.
 *
 * Pattern K SEPARATE-FILE discipline (L#NN-50 family):
 * - webhooks/handler-debug.ts (#6381, #6468)
 * - schedules/tools/tools-debug.ts (#6475, #6370)
 * - github/tools-debug.ts (#6459)
 * - email/migadu-manager-debug.ts (D50 #6553)
 * - this registry (D50 #6430)
 *
 * Test file imports MIGRATED_FILES + CANDIDATE_FILES + HelperFileMigration
 * from this module. Future cycles only edit THIS registry (separate file),
 * not the test logic.
 */

export interface HelperFileMigration {
  path: string;
  expectedOneObjectArgCalls: number; // remaining 1-arg forgeDebug calls (target: 0)
}

export const MIGRATED_FILES: HelperFileMigration[] = [
  {
    // D38 #6300 migaduManagerDebug: uses 3-positional-arg internally
    path: 'email/migadu-manager.ts',
    expectedOneObjectArgCalls: 0,
  },
  {
    // D41 #6390 migrationsDebug: uses 3-positional-arg internally
    path: 'database/migrate.ts',
    expectedOneObjectArgCalls: 0,
  },
  {
    // D42 cycle 16 hireAgentDebug: uses 3-positional-arg internally
    path: 'agents/hire-agent.ts',
    expectedOneObjectArgCalls: 0,
  },
  {
    // D43 cycle 19 adminReadModelDebug: module-local helper pattern
    // expected=0 because helper body has its own forgeDebug call in agents-detail-debug.ts
    path: 'admin/read-model/agents-detail.ts',
    expectedOneObjectArgCalls: 0,
  },
  {
    // D42 cycle 17 labelsDebug: uses 3-positional-arg internally
    path: 'github/ops/labels.ts',
    expectedOneObjectArgCalls: 0,
  },
  {
    // D42 cycle 18 createForgeAgentDebug: INLINE pattern, expected=1 for helper body
    path: 'agents/create-forge-agent.ts',
    expectedOneObjectArgCalls: 1,
  },
  {
    // D42 cycle 20 ltmIndexManagerDebug: INLINE pattern
    // expected=1 because helper body has 1 inline forgeDebug call
    path: 'agents/ltm/recall/index-manager.ts',
    expectedOneObjectArgCalls: 1,
  },
  {
    // D42 cycle 23 topUpAgentContractDebug: separate-file pattern, spreads context to top-level
    path: 'agents/top-up-agent-contract.ts',
    expectedOneObjectArgCalls: 0,
  },
  {
    // D42 cycle 19 agentRunnerDebug: spreads context to top-level (L#NN-50 #50 LOG RETENTION)
    path: 'agents/agent-runner-generate.ts',
    expectedOneObjectArgCalls: 0,
  },
  {
    // D42 cycle 21 workspaceSkillArchiveDebug: spreads context to top-level (L#NN-50 #50 LOG RETENTION)
    path: 'agents/workspace-skill-archive.ts',
    expectedOneObjectArgCalls: 0,
  },
  {
    // D42 cycle 22 ctxReposDebug: INLINE pattern, wraps ctx.forgeDebug
    // expected=1 because helper body has 1 ctx.forgeDebug call
    path: 'github/ops/repos.ts',
    expectedOneObjectArgCalls: 1,
  },
  {
    // D42 cycle 25 adminSystemResetDebug: module-local helper pattern
    // expected=1 because helper body has 1 inline forgeDebug call
    path: 'system/reset.ts',
    expectedOneObjectArgCalls: 1,
  },
  {
    // D42 cycle 26 scheduleHelpersDebug: module-local helper pattern
    // D46 cycle 13 (commit 101a5ad8) extracted to separate-file scheduleHelpersDebug with SPREAD contract.
    // Post-D46 the file uses scheduleHelpersDebug (3-positional-arg internally), no direct forgeDebug calls.
    // expected=0 because file now has 0 forgeDebug calls (registry entry was stale, fixed in D50 #6430 cycle 7)
    path: 'schedules/notifications/wake-content.ts',
    expectedOneObjectArgCalls: 0,
  },
  {
    // D42 cycle 27 agentHomeMetricsDebug: L#NN-50 #50 SPREAD helper pattern
    // expected=1 because helper body has 1 inline forgeDebug call
    path: 'agents/agent-home-metrics-thread-helpers.ts',
    expectedOneObjectArgCalls: 1,
  },
  {
    // D42 cycle 28 appLifecycleOpsDebug: module-local helper pattern
    // expected=1 because helper body has 1 inline forgeDebug call
    path: 'github/ops/app-lifecycle.ts',
    expectedOneObjectArgCalls: 1,
  },
  {
    // D42 cycle 29 routingOpsDebug: INLINE ctx.forgeDebug wrapper pattern
    // expected=1 because helper body has 1 inline ctx.forgeDebug call
    path: 'github/ops/routing.ts',
    expectedOneObjectArgCalls: 1,
  },
  {
    // D42 cycle 30 credentialsOpsDebug: INLINE ctx.forgeDebug wrapper pattern
    // expected=1 because helper body has 1 inline ctx.forgeDebug call
    path: 'github/ops/credentials.ts',
    expectedOneObjectArgCalls: 1,
  },
  {
    // D42 cycle 31 coolifyHttpDebug: separate-file pattern
    // expected=0 because helper body has 0 forgeDebug calls (uses ...context spread)
    path: 'coolify/http.ts',
    expectedOneObjectArgCalls: 0,
  },
  {
    // D42 cycle 32 internalChatServiceHelpersDebug: separate-file pattern
    // expected=0 because helper body has 0 forgeDebug calls (uses ...context spread)
    path: 'communication/internal-chat-service-helpers.ts',
    expectedOneObjectArgCalls: 0,
  },
  {
    // D42 cycle 33 agentLoaderDataDebug: module-local helper pattern
    // expected=1 because helper body has 1 inline forgeDebug call
    path: 'agents/agent-loader-data.ts',
    expectedOneObjectArgCalls: 1,
  },
  {
    // D42 cycle 34 discordMessageParserDebug: module-local helper pattern
    // expected=1 because helper body has 1 inline forgeDebug call
    path: 'discord/message-parser.ts',
    expectedOneObjectArgCalls: 1,
  },
  {
    // D43 cycle 36 internalChatGuardsDebug: separate-file pattern
    // expected=0 because helper body has 0 forgeDebug calls (uses ...context spread)
    path: 'communication/internal-chat-guards.ts',
    expectedOneObjectArgCalls: 0,
  },
  {
    // D43 cycle 37 renewAgentContractDebug: separate-file pattern
    // expected=0 because helper body has 0 forgeDebug calls (uses ...context spread)
    path: 'agents/renew-agent-contract.ts',
    expectedOneObjectArgCalls: 0,
  },
  {
    // D43 cycle 2 companyCashOperationsDebug: module-local helper inside factory function
    // expected=1 because helper body has 1 inline forgeDebug call (message is shorthand property)
    path: 'finance/company-cash-operations.ts',
    expectedOneObjectArgCalls: 1,
  },
  {
    // D43 cycle 39 globalSkillsDebug: separate-file pattern
    // expected=0 because helper body has 0 forgeDebug calls (uses ...context spread)
    path: 'agents/global-skills.ts',
    expectedOneObjectArgCalls: 0,
  },
  {
    // D43 cycle 21 adminRoutesHelpersDebug: INLINE pattern, expected=1 (helper body)
    path: 'admin/routes/helpers.ts',
    expectedOneObjectArgCalls: 1,
  },
  {
    // D44 cycle 22: TWO helpers in one file (different scopes)
    // adjustAgentContractBudgetDebug (scope=adjust-agent-contract-budget, 2 calls)
    // agentContractBudgetDebug (scope=agent-contract-budget, 2 calls)
    // Each helper body has 1 forgeDebug call => expected=2 total
    path: 'agents/adjust-agent-contract-budget.ts',
    expectedOneObjectArgCalls: 2,
  },
  {
    // D44 cycle 40 bundledWorkspaceSkillsDebug: separate-file pattern
    // expected=0 because helper body uses ...context spread (no forgeDebug calls)
    path: 'agents/bundled-workspace-skills.ts',
    expectedOneObjectArgCalls: 0,
  },
  {
    // D44 cycle 41: skillsToolsDebug (separate-file pattern)
    // expected=0 because helper body uses ...context spread (no forgeDebug calls)
    path: 'agents/skills-tools.ts',
    expectedOneObjectArgCalls: 0,
  },
  {
    // D44 cycle 42: agentRunnerContextLoaders REUSES existing agentRunnerDebug helper (Pattern M N=1)
    // expected=0 because no direct forgeDebug calls (helper handles all)
    path: 'agents/agent-runner-context-loaders.ts',
    expectedOneObjectArgCalls: 0,
  },
  {
    // D45 cycle 1: adminRouteErrorDebug (separate-file pattern)
    // expected=0 because helper body uses ...context spread (no forgeDebug calls)
    path: 'admin/routes/agents/admin-route-error-helper.ts',
    expectedOneObjectArgCalls: 0,
  },
  {
    // D45 cycle 3: agentRunnerExecute REUSES existing agentRunnerDebug helper (Pattern M N=2)
    // expected=0 because no direct forgeDebug calls (helper handles all)
    path: 'agents/agent-runner-execute.ts',
    expectedOneObjectArgCalls: 0,
  },
  {
    // D45 cycle 3: agentRunner REUSES existing agentRunnerDebug helper (Pattern M N=2)
    // expected=0 because no direct forgeDebug calls (helper handles all)
    path: 'agents/agent-runner.ts',
    expectedOneObjectArgCalls: 0,
  },
  {
    // D45 cycle 4: workspaceSearch REUSES existing ltmDebug helper (Pattern M REUSE in ltm scope)
    // expected=0 because no direct forgeDebug calls (helper uses ...context spread, L#NN-50 #50 SPREAD)
    path: 'agents/ltm/recall/workspace-search.ts',
    expectedOneObjectArgCalls: 0,
  },
  {
    // D45 cycle 5: agentsRuntimeMemory REUSES existing adminReadModelDebug helper (Pattern M REUSE in admin-read-model scope)
    // expected=0 because no direct forgeDebug calls (helper uses ...context spread, L#NN-50 #50 SPREAD)
    // ★ Pattern M N=3 PERMANENT trigger (3rd cluster: D44 #6450 agent-runner + D45 #6455 ltm + cycle 5 admin-read-model)
    path: 'admin/read-model/agents-runtime-memory.ts',
    expectedOneObjectArgCalls: 0,
  },
  {
    // D45 cycle 6 Triple-Fix: recall.ts imports ltmDebug (../ltm-debug-helpers) + ltmRecallDebug (./recall-debug)
    // expected=0 because no direct forgeDebug calls (Pattern M REUSE + Pattern K SEPARATE-FILE + L#NN-50 #50 SPREAD)
    // ★ L#NN-Triple-Fix-Cycle-Protocol v1 N=2 (2nd instance after Aldric #6456)
    path: 'agents/ltm/recall.ts',
    expectedOneObjectArgCalls: 0,
  },
  {
    // D45 cycle 7 Pattern M REUSE N=4: workspace-skill-helpers.ts uses workspaceSkillArchiveDebug helper
    // expected=0 because no direct forgeDebug calls (Pattern M REUSE applied, helper has SPREAD contract)
    // ★ L#NN-YYY v6 Pattern M N=4 PERMANENT GOLD trigger (4th distinct scope: workspace-skills)
    path: 'agents/workspace-skill-helpers.ts',
    expectedOneObjectArgCalls: 0,
  },
  {
    // D45 cycle 7 Pattern M REUSE N=4: workspace-skills.ts deletes local workspaceSkillsDebug, uses workspaceSkillArchiveDebug
    // expected=0 because no direct forgeDebug calls (local helper deleted, Pattern M REUSE applied)
    // ★ Anti-pattern eliminated: LOCAL HELPER SHADOWING (workspaceSkillsDebug duplicated scope='workspace-skills' inline)
    // ★ L#NN-YYY v4 anti-pattern catch (2nd instance after recall.ts cycle 6)
    path: 'agents/workspace-skills.ts',
    expectedOneObjectArgCalls: 0,
  },
];

export const CANDIDATE_FILES: HelperFileMigration[] = [
];
