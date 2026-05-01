# Aldric — Agent Context

## Role
Senior Developer — Test coverage expansion, code quality enforcement, large-scale refactoring.

## Current Mission
Expand test coverage across ad-product-forge monorepo, focusing on agents/, schedules/, admin/routes/.

## Status

### agents/ — files without tests (7)
| File | Lines | Notes |
|------|-------|-------|
| agent-runner.ts | 1329 | Core agent runner, complex |
| create-forge-agent.ts | 239 | Agent creation factory |
| global-skills.ts | 337 | Skill management, file ops |
| internal-agent-lifecycle.ts | 107 | Hiring/termination orchestration |
| skills-tools.ts | 151 | Skill tool definitions |
| mcp/store.ts | 151 | DB operations for MCP configs |
| agent-loader.ts | 118 | Agent loading |
| internal-agent-tools.ts | 1 | Has test (verified above) |

### agents/ — covered (12)
- agent-loader-data.test.ts, agent-loader-runtime-config.test.ts, agent-loader-tools.test.ts, agent-loader-types.test.ts
- agent-runner-context.test.ts, agent-runner-helpers.test.ts, agent-runner-loop-detector.test.ts, agent-runner-messages.test.ts, agent-runner-scheduler.test.ts, agent-runner-usage.test.ts, agent-runner-wake.test.ts
- agent-contract-store.test.ts

### schedules/ — ✅ Fully covered (all .ts have .test.ts)

### admin/routes/ — files without tests (6)
| File | Lines | Notes |
|------|-------|-------|
| system/read.ts | 140 | System read endpoint |
| agents/write.ts | 64 | Agent write endpoint |
| index.ts | 27 | Route aggregator |
| agents/index.ts | 8 | Agent route aggregator |
| finance/index.ts | 6 | Finance route aggregator |
| system/index.ts | 2 | System route aggregator |

## Current Test Results
- agents/: 46 test files, 715 tests, all passing
- schedules/: fully covered, 19 files
- admin/routes/: 15 test files, 359 tests, all passing

## Recent Fixes
- Fixed agent-runner-context.test.ts: 8,000 assertion mismatch

## Workspace
/app/workspaces/c917cd25-0cd6-49d6-b478-fa9b1eb78c19/workspace/adpf-current/apps/forge/src/

## Boundaries
Focus on coverage expansion, code quality enforcement, refactoring.