## Summary

Completes the schedules manager test suite for #795. **191/191 tests passing** across 12 test files.

## Changes

### manager.test.ts (new file — 484 lines)
Full test coverage for createAgentScheduleManager using a mock DB with Drizzle ORM simulation:
- validateScheduleInput — rejects invalid inputs
- listSchedules — loads active schedules, handles empty list
- createSchedule — heartbeat, cron, and date-based schedules
- createScheduleForAgent — cross-agent creation + reload failure simulation
- updateAgentSchedule — full and partial cron updates
- getAgentSchedule / getOwnedSchedule — ownership checks
- deleteSchedule — deletion, not-found handling, and authorization

### manager.ts (2 changes)
- Line 108: getOwnedSchedule now has row.kind !== 'agent' guard, matching getAgentSchedule behavior
- Line 383: deleteSchedule throws on not-found instead of returning { success: false }

### Mock Design Decisions
- findFirstCounter: 5th+ call per filter returns null (catches runaway loops)
- findMany callTracker: 2nd+ call per filter returns empty (simulates DB exhaustion)
- reloadNext flag: Set via setReloadFails(), consumed at start of next findFirst call
- Row kind: Determines whether getAgentSchedule/getOwnedSchedule reload succeeds

## Test Results
Test Files  12 passed (12)
Tests       191 passed (191)
Duration    3.01s
