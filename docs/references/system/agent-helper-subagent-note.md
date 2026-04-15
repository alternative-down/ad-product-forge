# Agent Helper Subagent Note

## Intent

Document a future helper/subagent mode that can execute bounded internal work without polluting the main agent's active context.

This is intentionally not implemented yet.

## Why

Some work is expensive in context shape, token volume, or intermediate reasoning noise:

- repository inspection
- broad search/collection
- long structured analysis
- repetitive transformation tasks
- internal drafting that should not stay in the main run context

A helper/subagent would let the main agent delegate those bounded tasks and receive back only the result that matters.

## Constraints

Any future implementation must preserve the existing operational model:

- the main agent still owns the contract
- the main agent still owns the visible run lifecycle
- step interval logic must remain coherent
- cost registration must remain attributable
- the system must not create invisible off-the-books execution

## Non-goals

This is not:

- a replacement for multi-agent orchestration between real agents
- a hidden second autonomous worker with its own agenda
- a bypass for tool permissions or accounting

## Likely shape

If implemented later, the cleanest shape is:

- the main agent explicitly calls a helper capability
- the helper runs with:
  - bounded prompt
  - bounded tool surface
  - bounded token/time budget
- the helper returns:
  - result
  - artifacts if needed
  - structured summary
- only the returned result enters the main agent context

## Accounting expectations

Any future helper execution should still be reflected in the main operational ledger:

- step timing
- token usage
- cost attribution
- traceability in admin/logs

## Open questions for later

- whether helper work should count as part of the same step or as explicit child steps
- whether helper output should be stored in thread history, workspace files, or both
- what tool subset is safe for helper execution
- whether helper runs should use a cheaper default model
- how to expose helper traces in admin without making the UI noisy
