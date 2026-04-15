# TODO

Last updated: 2026-04-14
Branch: `develop`

This file tracks open work that was explicitly requested and is still pending.
Completed items should be removed or moved into changelog/history once they are fully delivered.

## Operational Bugs

### High priority
- Investigate and fix the remaining long freeze case where the agent stays effectively stuck for more than the configured `generate` timeout and only recovers after manual `idle + rewakeup`.
  - Current suspicion:
    - state inconsistency around context reconstruction
    - `generate` path that never returns cleanly
    - possible malformed tool-call/tool-result pair or processor-side state drift
  - Required work:
    - add stronger stage logging around pre-generate context reconstruction
    - correlate frozen runs with contract step creation and OM logs
    - prove whether the hang is before `generate`, inside `generate`, or after `generate` before usage/step persistence

- Recheck the runner path where the agent can remain `running` after `STOP_AND_IDLE`.
  - Part of the `idleOnly` wake flow was fixed.
  - Still needs observation in production to confirm no remaining re-entry path.

- Recheck and fully eliminate the case where heartbeat/cron prompt content leaks into feedback or a normal run even when configured to wake only while idle.
  - Part of the `idleOnly` append path was fixed.
  - Still needs validation against real production traces.

## OM / Checkpointed Context

- Investigate whether the admin OM metrics and “Thread após cursor” snapshot still have edge cases where the displayed numbers do not match the real OM state.
  - Current known concern:
    - user still suspects some snapshots may be misleading in certain states

## Skills / MCP

### High priority
- Allow agents to actually manage and improve their own skills.
  - Current issue:
    - they can now create and edit local skills in their own workspace
    - what still does not exist is a clean path for agents to publish, promote, or share those improvements into the global catalog intentionally

- Give the future LTM agent read/write access to the skills area so it can:
  - create new skills
  - improve existing skills
  - maintain instructions, scripts, and references that the main agent can later use

## Admin UI

### High priority
- Rework the admin layout to increase useful space.
  - Current complaints:
    - effective reading/working area feels too small
    - some screens do not occupy the remaining viewport height correctly
    - the chat/conversation areas are especially constrained
    - mobile reading space is too reduced

- Build a more managerial overview for agents.
  - Desired signals:
    - last step at
    - interval since last step
    - token usage
    - OM indicators
    - recent conversations / unread state
    - progress bars / tooltips / compact operational summaries
  - Intended use:
    - user mostly watches logs and contracts today
    - needs a denser, more executive overview of agent state

## Agent Architecture

### Document only for now
- Explore supporting a subordinate helper/subagent that can work without polluting the main agent’s active context.
  - Constraints that must still be respected:
    - step interval logic
    - contract accounting
    - step cost registration
  - This is intentionally not being implemented yet.

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

### Medium priority
- Define how the future LTM workflow should surface its own operational state in admin.
  - examples:
    - last memory run
    - last processed checkpoint package
    - pending packages
    - memory workspace indicators
