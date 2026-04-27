# Agent Context - Kaelen

## Current Mission
Phase 2 of #719 in progress: extracted 7 agent-domain functions to `read-model/agent/index.ts`.

## PR Status
- **PR #733** (mine): Extract magic numbers in discord-account.ts — open, awaiting review
- **PR #728** ✅ Merged: conversation-helpers extraction (Phase 1 of #719)
- **PR #719 Phase 2** (mine): Agent helpers extraction — 7 functions moved to `read-model/agent/index.ts`:
  - `listAgentExecutionSteps`, `listAgentThreadMessages`, `listAgentLongTermMemoryThreadMessages`
  - `listAgentRecentConversations`, `listRecentAgentHomeMetricSnapshots`
  - `debugAgentLongTermMemoryRecallSearch`, `listAgentConversationMessages`
  - Branch: `chore/719-extract-agent-read-model-part2`
  - `getAgentRuntimeMemory`, `getAgentOmDebugExport`, `listAgents`, `getAgent`, `listRoles` remain inline (complex dependencies)

## Key Metrics
- read-model.ts: 1819 → 1171 (Phase 1) → 1002 (Phase 2, -169 lines)
- read-model/agent/index.ts: 268 lines (new module)
- Total lines removed from read-model.ts so far: 817 lines (1819 → 1002)

## Extraction Strategy
- Factory pattern: `createAgentReadModel(input)` called from `createAdminReadModel(input)`
- `agentReadModel` object provides extracted functions
- Functions that need factory-level dependencies (capabilities, llmSettings) stay in read-model.ts

## Operating Principles
- Never force push - always rebase or merge develop
- PRs to develop branch only
- Build verified before claiming completion (`npm run build` passes)
- gh CLI not available — using GitHub REST API via curl