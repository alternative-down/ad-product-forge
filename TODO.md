# TODO

Last updated: 2026-04-14
Branch: `develop`

This file tracks open work that was explicitly requested and is still pending.
Completed items should be removed or moved into changelog/history once they are fully delivered.

## LTM

### High priority
- Implement the new workspace-based LTM flow described in:
  - [`docs/references/system/agent-long-term-memory-redesign.md`](./docs/references/system/agent-long-term-memory-redesign.md)
  - [`docs/references/system/agent-long-term-memory-technical-spec.md`](./docs/references/system/agent-long-term-memory-technical-spec.md)

- First implementation scope:
  - checkpoint package writer under `workspace-memory/checkpoints`
  - immutable checkpoint package structure
  - async memory workflow outside the main processor path
  - memory-maintained documents under `workspace-memory/memory`
  - package processing tracking / state
