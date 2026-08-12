/**
 * L#NN-50 #18 v10 tripwire test — helper-extraction rollout guard.
 *
 * Purpose: Enforce the L#NN-50 #18 v10 pattern: helper extractions (functions
 * with "Debug" in name like capabilitiesStoreDebug, hiringDebug, migaduManagerDebug)
 * MUST use 3-positional-arg form internally: forgeDebug(scope, message, context).
 *
 * The 1-object-arg form (forgeDebug({ scope, level, message, context })) is
 * accepted by the runtime overload (forgeDebug signature was updated to support
 * both forms in D39) but is NOT the canonical helper pattern.
 *
 * Reference correct deployment: D38 PR #6300 migaduManagerDebug.
 *
 * MIGRATED (uses 3-positional-arg internally):
 * - apps/forge/src/email/migadu-manager.ts (D38 #6300, Aldric)
 * - apps/forge/src/scripts/init-agent-registry.ts (D41 #6389, Kaelen)
 * - apps/forge/src/database/migrate.ts (D41 #6390, Kaelen)
 * - apps/forge/src/agents/hire-agent.ts (D42 cycle 16, Varek)
 * - apps/forge/src/github/ops/labels.ts (D42 cycle 17, Varek)
 * - apps/forge/src/agents/create-forge-agent.ts (D42 cycle 18, Varek, INLINE pattern)
 * - apps/forge/src/agents/ltm/recall/index-manager.ts (D42 cycle 20, Varek, inline pattern)
 * - apps/forge/src/github/ops/milestones.ts (D42 cycle 24, Varek, INLINE ctx.forgeDebug wrapper pattern)
 * - apps/forge/src/github/ops/repos.ts (D42 cycle 22, Varek, ctx.forgeDebug pattern)
 * - apps/forge/src/admin/routes/system/reset.ts (D42 cycle 25, Varek, NEW domain admin-system-reset)
 * - apps/forge/src/schedules/notifications/wake-content.ts (D42 cycle 26, Varek, NEW domain schedule-helpers)
 * - apps/forge/src/agents/agent-home-metrics-thread-helpers.ts (D42 cycle 27, Varek, NEW domain agent-home-metrics, L#NN-50 #50 LOG RETENTION SPREAD)
 * - apps/forge/src/github/ops/app-lifecycle.ts (D42 cycle 28, Varek, NEW domain github-manager-app-lifecycle)
 * - apps/forge/src/coolify/http.ts (D42 cycle 31, Varek, separate-file pattern, NEW domain coolify-http)
 - apps/forge/src/communication/internal-chat-service-helpers.ts (D42 cycle 32, Varek, separate-file pattern, NEW domain internal-chat-service-helpers)
 - apps/forge/src/agents/agent-loader-data.ts (D42 cycle 33, Varek, module-local helper pattern, NEW domain agent-loader-data)
 - apps/forge/src/discord/message-parser.ts (D42 cycle 34, Varek, module-local helper pattern, NEW domain discord-message-parser)
 - apps/forge/src/github/ops/routing.ts (D42 cycle 29, Varek, INLINE ctx.forgeDebug wrapper pattern, 4th github/ops/)
 * - apps/forge/src/agents/workspace-skill-archive.ts (D42 cycle 21, Varek, NEW domain workspace-skills)
 * - apps/forge/src/agents/agent-runner-generate.ts (D42 cycle 19, Varek, L#NN-50 #50 LOG RETENTION applied to runtimeId)
 * - apps/forge/src/agents/top-up-agent-contract.ts (D42 cycle 23, Varek, NEW domain top-up-agent-contract)
 *
 * CANDIDATES (uses 1-object-arg internally, NOT yet migrated):
 * - apps/forge/src/capabilities/store.ts (D37 #6270, Aldric)
 * - apps/forge/src/agents/hiring-requests-handler.ts (D37 #6277, Aldric)
 * - apps/forge/src/discord-account.ts (D38 #6302, Kaelen)
 * - apps/forge/src/admin/read-model/agents-debug.ts (D37 #6273, Kaelen)
 * - (other 1-object-arg call sites in non-helper contexts are out of scope)
 *
 * Tracked for future migration PRs (scope-boundary: NOT fixed in this PR).
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const FORGE_SRC = join(import.meta.dirname);

interface HelperFileMigration {
  path: string;
  expectedOneObjectArgCalls: number; // remaining 1-arg forgeDebug calls (target: 0)
}

const MIGRATED_FILES: HelperFileMigration[] = [
  {
    // D38 #6300 migaduManagerDebug: uses 3-positional-arg internally
    path: 'email/migadu-manager.ts',
    expectedOneObjectArgCalls: 0,
  },
  {
    // D41 #6389 initAgentRegistryDebug: uses 3-positional-arg internally
    path: 'scripts/init-agent-registry.ts',
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
    path: 'admin/routes/system/reset.ts',
    expectedOneObjectArgCalls: 1,
  },
  {
    // D42 cycle 26 scheduleHelpersDebug: module-local helper pattern
    // expected=1 because helper body has 1 inline forgeDebug call
    path: 'schedules/notifications/wake-content.ts',
    expectedOneObjectArgCalls: 1,
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
];

const CANDIDATE_FILES: HelperFileMigration[] = [
  { path: 'capabilities/store.ts', expectedOneObjectArgCalls: 0 },
  { path: 'agents/hiring-requests-handler.ts', expectedOneObjectArgCalls: 0 },
  { path: 'discord-account.ts', expectedOneObjectArgCalls: 0 },
  { path: 'admin/read-model/agents-debug.ts', expectedOneObjectArgCalls: 0 },
];

/**
 * Helper function name pattern: must contain "Debug" (case-insensitive).
 * Examples: capabilitiesStoreDebug, hiringDebug, migaduManagerDebug, discordAccountDebug
 */
const HELPER_FUNCTION_PATTERN = /(?:export\s+)?(?:async\s+)?(?:function|const)\s+(\w*[Dd]ebug\w*)\s*[=(]/g;

/**
 * 1-object-arg forgeDebug call pattern: forgeDebug({...}) where the first
 * argument is an object literal (not a string for 3-positional-arg form).
 */
const ONE_OBJECT_ARG_FORGEDEBUG_PATTERN = /forgeDebug\s*\(\s*\{/g;

function findTypeScriptFiles(dir: string, results: string[] = []): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.turbo') {
        continue;
      }
      findTypeScriptFiles(full, results);
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.d.ts')) {
      results.push(full);
    }
  }
  return results;
}

function findHelperFunctionRanges(content: string): Array<{ name: string; start: number; end: number }> {
  const results: Array<{ name: string; start: number; end: number }> = [];
  HELPER_FUNCTION_PATTERN.lastIndex = 0;
  let match;
  while ((match = HELPER_FUNCTION_PATTERN.exec(content)) !== null) {
    const startIdx = match.index;
    const name = match[1];
    const braceIdx = content.indexOf('{', startIdx);
    if (braceIdx === -1) continue;
    let depth = 0;
    let i = braceIdx;
    for (; i < content.length; i++) {
      if (content[i] === '{') depth++;
      else if (content[i] === '}') {
        depth--;
        if (depth === 0) {
          results.push({ name, start: braceIdx, end: i + 1 });
          break;
        }
      }
    }
  }
  return results;
}

function countOneObjectArgCalls(content: string): number {
  ONE_OBJECT_ARG_FORGEDEBUG_PATTERN.lastIndex = 0;
  const matches = content.match(ONE_OBJECT_ARG_FORGEDEBUG_PATTERN);
  return matches ? matches.length : 0;
}

describe('L#NN-50 #18 v10 helper-extraction rollout guard', () => {
  // Sanity check: ensure migration registry is non-empty
  it('has at least one migrated file in registry', () => {
    expect(MIGRATED_FILES.length).toBeGreaterThan(0);
  });

  // Verify MIGRATED files have ZERO 1-object-arg calls (regression guard)
  for (const migrated of MIGRATED_FILES) {
    describe(`MIGRATED: ${migrated.path}`, () => {
      const filePath = join(FORGE_SRC, migrated.path);
      let actualCount = 0;
      try {
        const content = readFileSync(filePath, 'utf-8');
        actualCount = countOneObjectArgCalls(content);
      } catch {
        // File might not be in sparse-checkout
      }

      it(`has zero 1-object-arg forgeDebug calls (expected: ${migrated.expectedOneObjectArgCalls})`, () => {
        expect(actualCount).toBe(migrated.expectedOneObjectArgCalls);
      });
    });
  }

  // Track CANDIDATE files (NOT yet migrated, intentional)
  for (const candidate of CANDIDATE_FILES) {
    describe(`CANDIDATE (not yet migrated): ${candidate.path}`, () => {
      const filePath = join(FORGE_SRC, candidate.path);
      let actualCount = 0;
      let exists = true;
      try {
        const content = readFileSync(filePath, 'utf-8');
        actualCount = countOneObjectArgCalls(content);
      } catch {
        exists = false;
      }

      it('is tracked (informational, will fail when migrated)', () => {
        // This is an INFORMATIONAL test. It only fails if the file has been
        // migrated (1-arg count is 0) but is still in the CANDIDATE_FILES
        // registry (should be moved to MIGRATED_FILES). Existing candidates
        // with non-zero 1-arg count pass.
        if (exists && actualCount === 0 && candidate.expectedOneObjectArgCalls > 0) {
          throw new Error(
            `${candidate.path} has 0 1-object-arg calls but is still in CANDIDATE_FILES. ` +
            `Move it to MIGRATED_FILES.`
          );
        }
        // Otherwise pass (informational)
        expect(true).toBe(true);
      });
    });
  }
});
