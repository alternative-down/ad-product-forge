# Agent Office View Redesign

## Status

- Working Spec
- Branch: `develop`
- Purpose: define the intent, product role, and operating boundaries of a spatial office view for agents

## Objective

The current home surfaces agent state through cards and metrics.
That works, but it does not give a strong operational sense of:

- who is active right now
- who is blocked
- who is interacting with whom
- which areas of the company are busy
- how the system feels as a living organization

The office view should become a visual operational surface for the company.
It should make the multi-agent system feel spatial, active, and legible at a glance.

## Product Intent

The office view is not decoration.
It is a management view.

It should help the operator:

- understand agent state quickly
- notice anomalies faster than in a list
- see activity patterns across the company
- spot stuck agents, absent agents, idle clusters, and active conversations
- inspect what is happening without opening multiple detail pages

The desired feeling is:

- light
- playful enough to feel alive
- operational enough to be genuinely useful

It should feel closer to a shared office or team floor than to a dashboard.

## Core Principle

The scene must represent real system state, not invented animation.

Every visible behavior should map to actual runtime signals, such as:

- `idle`
- `running`
- `absent`
- active conversations
- active LTM work
- schedule wakes
- recent step activity
- OM pressure

The visual layer may stylize those states, but it must not fabricate them.

## User Value

The office view should improve these workflows:

1. glanceable monitoring

- which agents are doing real work
- which agents have gone quiet
- which agents are retrying or absent

2. social/topology awareness

- which agents are interacting
- which teams or roles are active together
- whether work is clustered or isolated

3. anomaly detection

- an agent stuck in one spot too long
- an agent that remains absent
- an agent with heavy OM pressure
- an agent with no recent step despite expected activity

4. company presence

- the operator should feel that the company is operating as a whole, not as scattered records in tables

## Scene Model

The home should become a 2D office-like environment.

Examples of zones:

- focused work desks
- shared discussion areas
- memory/library/archive area
- hiring/RH area
- idle/lounge area

Zones are semantic, not decorative.
They provide a stable visual language for what agents are doing.

## Agent Representation

Each agent should appear as a small avatar or sprite.

Each avatar should communicate:

- agent identity
- status
- role
- current activity hint

Minimal desired cues:

- avatar
- name
- status state
- a short current-action bubble or hover detail

## State Mapping

The office view should map runtime states into spatial behaviors.

Suggested baseline:

- `running`
  - agent is visibly active at a workstation or moving toward an active area

- `idle`
  - agent is stationary in a neutral area

- `absent`
  - agent is visually flagged as unavailable, degraded, or retrying

- active conversation
  - participating agents are co-located or visually linked

- LTM running
  - agent appears in a memory/archive-related area

- hiring / internal RH
  - appears in a dedicated recruiting or onboarding area

## Information Density

The office view should stay readable.

It must not turn into a dense overlay of metrics everywhere.

The view should use layers:

1. ambient layer

- motion
- position
- zone occupancy

2. lightweight agent labels

- status color
- name
- one short hint

3. on-demand detail

- tooltip, popover, side panel, or click state
- last step time
- step interval
- OM indicators
- LTM state
- last action summary

## Non-Goals

The first version should not try to be:

- a game
- a physics simulation
- a full spatial planning tool
- a replacement for detailed agent logs

It is a high-value overview surface, not a toy world.

## Design Direction

The visual language should stay aligned with the Forge Admin direction:

- light
- warm or neutral
- calm
- expressive but not noisy

The scene should feel more like a gentle collaborative office illustration than a corporate operations center.

## Progressive Delivery

This should be implemented in phases.

### Phase 1

- static 2D scene layout
- positioned agent avatars
- state-driven animation and zone placement
- hover or click details

### Phase 2

- conversation clustering
- movement between zones
- better activity bubbles
- richer manager interactions

### Phase 3

- optional canvas/engine upgrade if the product value proves out

## Invariants

- the office view must be driven by real agent state
- the view must remain usable on desktop and mobile
- the home must stay operationally useful even if the visual scene is simplified
- detailed observability remains available in existing pages
- the scene must degrade cleanly if animation or rich rendering is disabled

## Why This Fits The Project

This project already behaves like a company simulation with real work happening:

- agents have roles
- they communicate
- they execute steps
- they go idle, run, retry, and build memory

The office view makes that structure legible.
It turns the home into a live organizational map instead of a static list.
