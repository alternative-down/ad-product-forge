# Agent Office View Technical Spec

## Status

- Working Spec
- Branch: `develop`
- Scope: technical implementation plan for a spatial 2D office view on the Forge Admin home

## Inputs

This spec is derived from:

- [agent-office-view-redesign.md](/home/nicolas/Documentos/github/ad-product-forge/docs/references/system/agent-office-view-redesign.md)
- [forge-admin-ui-system.md](/home/nicolas/Documentos/github/ad-product-forge/docs/design-system/forge-admin-ui-system.md)
- [forge-admin-implementation.md](/home/nicolas/Documentos/github/ad-product-forge/docs/design-system/forge-admin-implementation.md)

## Technical Goal

Implement a new home surface that renders agents inside a spatial office scene, driven by real runtime state from the backend.

The implementation should:

- reuse the current home query as the base data source
- add only the extra state needed for spatial placement and lightweight detail
- preserve the existing detailed routes for logs, contract, conversations, and agent detail

The first version should optimize for:

- fast iteration
- clear mapping from runtime state to visuals
- maintainable frontend architecture

## Rendering Strategy

The first implementation should not start with canvas.

Preferred initial approach:

- React DOM
- positioned scene layers
- CSS transforms and transitions
- lightweight motion for state changes

Why:

- easier to iterate on layout and semantics
- easier to debug
- easier to keep accessible
- simpler to make responsive

Canvas or a 2D engine should be considered only if:

- DOM rendering becomes too expensive
- richer motion/pathfinding becomes clearly valuable
- the product direction is already proven

## Route Placement

The office view should replace or substantially reshape the current home route.

Primary route:

- `apps/forge-admin/src/routes/home/index.tsx`

The scene should remain the top-level management surface of home.

## Data Model

The office view should consume agent-level status data that already exists or can be derived cheaply.

Required per-agent fields:

- `agentId`
- `name`
- `roleName`
- `executionState`
- `lastStepAt`
- `secondsSinceLastStep`
- `averageStepInterval`
- `lastStepInputTokens`
- OM metrics
  - recent raw tokens
  - overflow tokens
  - observation tokens
  - reflection tokens
- LTM state
  - running / idle / absent-equivalent state
  - package counts if useful
- active conversation indicators if available

Optional later additions:

- team or department grouping
- currently addressed peer agents
- stuck/retry flags
- wake source hints

## Backend Read Model

The backend should expose one scene-oriented read model for home rather than making the frontend derive too much layout state.

Suggested additions to the current home read model:

- a compact `activityKind`
  - `running`
  - `idle`
  - `absent`
  - `ltm`
  - `conversation`
- a compact `urgency`
  - derived from stale step timing, absent state, or pressure
- conversation partner hints when there is an obvious active peer

These should remain descriptive, not prescriptive.
The frontend still decides final placement and animation.

## Scene Layout Model

The frontend should define a deterministic scene model.

Suggested structure:

- `zones`
  - work
  - collaboration
  - memory
  - idle
  - hiring
- `agentPlacements`
  - computed from current state

Placement rules should be explicit and easy to follow.

Examples:

- `running` -> work zone
- `idle` -> idle zone
- `absent` -> degraded/flagged zone or stationary state with visible issue marker
- `ltm running` -> memory zone
- active conversation -> collaboration zone or paired placement

## Scene Component Structure

Suggested component breakdown:

1. `OfficeScene`

- owns the scene layout and zone rendering

2. `OfficeZone`

- renders one named region
- owns local decorative elements if needed

3. `OfficeAgent`

- renders the avatar/sprite
- handles hover/click/selection state

4. `OfficeAgentPopover`

- shows compact operational details

5. `OfficeLegend` or lightweight filters

- optional
- only if needed after first pass

The file structure should stay route-local unless a primitive clearly becomes reusable.

## Avatar Strategy

The current generated avatars should be reused first.

Possible future upgrades:

- sprite sheet variations by status
- animated idle/running states
- accessory or color cues by role

But phase 1 should avoid creating a large asset pipeline.

## Motion Model

Motion should be restrained and stateful.

Initial motion types:

- slight idle float or breathing
- moving between zones on state change
- soft emphasis when agent starts running
- subtle degraded animation for absent/retry

Avoid:

- constant busy movement
- random wandering with no meaning
- animation that competes with readability

## Interaction Model

Primary interactions:

- hover on desktop for quick detail
- click/tap on mobile and desktop for stable detail
- click-through action to existing agent pages

Suggested detail payload:

- current status
- last step time
- average interval
- input tokens of last step
- OM bars
- LTM state
- short latest action summary

## Responsiveness

Desktop:

- full office scene
- multiple zones visible at once

Mobile:

- compressed scene
- same semantic mapping
- tap-first interaction
- less decorative space
- no reliance on tiny hover-only targets

The mobile version may stack or crop the scene differently, but it should not become unreadable.

## Performance Constraints

The home should stay lightweight enough for frequent refresh.

Guidelines:

- prefer transform-based animation
- avoid high-frequency re-layout
- keep refresh cadence low and intentional
- avoid per-frame simulation
- do not render unnecessary shadows/effects for many agents

## Refresh Model

The current home refresh interval can remain, but the office scene should not fully remount on every poll.

Preferred behavior:

- stable keyed agent nodes
- diff placement and state
- animate transitions between previous and next positions

## Observability

This feature should be easy to debug.

Recommended development helpers:

- optional debug overlay for zone ids and computed placement
- visible fallback labels when sprite rendering fails
- clear separation between backend data and frontend layout mapping

## Fallback Mode

If the office view fails to render or is turned off, the home should still be able to fall back to a simpler list/grid presentation.

This fallback can reuse the same read model.

## Suggested Delivery Phases

### Phase 1

- scene scaffold
- deterministic zone placement
- agent avatars
- hover/click detail
- state-based styling

### Phase 2

- conversation pairing
- transitions between zones
- improved compact details
- stronger visual grouping by team or role

### Phase 3

- optional canvas migration
- pathfinding or richer motion
- larger scenes or multi-room layouts

## Invariants

- no fake agent behavior disconnected from runtime state
- no canvas dependency in phase 1
- no replacement of detailed observability pages
- no heavy simulation loop
- no large asset burden in the first implementation

## Open Questions

- whether conversation relationships should be driven by explicit backend signals or inferred heuristically
- whether the home should show all agents in one scene or support filtered subsets
- whether the office should reflect team/department structure spatially from day one
- whether there should be a temporary fallback toggle between office view and compact list view
