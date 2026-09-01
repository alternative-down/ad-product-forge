/**
 * Pixel agent scene builder.
 * Extracted from pixel/index.tsx to reduce CRAP of buildSceneAgents.
 *
 * Re-exports SceneAgent from the parent module.
 * Delegates to resolveDeskAmbientPose (kept in parent — shared with advanceDeskAnimationState).
 */

import type { AgentListItem, SceneAgent, DeskAnimationState } from '../index';
import { resolveDeskAmbientPose } from '../index';

export { type SceneAgent };

export interface BuildSceneAgentsInput {
  agents: AgentListItem[];
  tick: number;
  nowMs: number;
  animationDeadlines: Record<string, number>;
  bubbleDeadlines: Record<string, number>;
  deskAnimationState: Record<string, DeskAnimationState>;
}

// ---------------------------------------------------------------------------
// Slot data
// ---------------------------------------------------------------------------

interface Slot {
  x: number;
  y: number;
  dir: SceneAgent['dir'];
}

function slot(x: number, y: number, dir: Slot['dir']): Slot {
  return { x, y, dir };
}

const RUNNING_SLOTS = [
  slot(WORLD_OFFSET_X + 4 * TILE_SIZE, WORLD_OFFSET_Y + 6.85 * TILE_SIZE, 'down'),
  slot(WORLD_OFFSET_X + 8 * TILE_SIZE, WORLD_OFFSET_Y + 6.85 * TILE_SIZE, 'down'),
  slot(WORLD_OFFSET_X + 4 * TILE_SIZE, WORLD_OFFSET_Y + 11.25 * TILE_SIZE, 'down'),
  slot(WORLD_OFFSET_X + 8 * TILE_SIZE, WORLD_OFFSET_Y + 11.25 * TILE_SIZE, 'down'),
];

const MEMORY_SLOTS = [
  slot(WORLD_OFFSET_X + 14.6 * TILE_SIZE, WORLD_OFFSET_Y + 4.9 * TILE_SIZE, 'left'),
  slot(WORLD_OFFSET_X + 17.2 * TILE_SIZE, WORLD_OFFSET_Y + 4.9 * TILE_SIZE, 'left'),
];

const FOCUS_SLOTS = [
  slot(WORLD_OFFSET_X + 13.5 * TILE_SIZE, WORLD_OFFSET_Y + 11.2 * TILE_SIZE, 'right'),
  slot(WORLD_OFFSET_X + 15.4 * TILE_SIZE, WORLD_OFFSET_Y + 12.2 * TILE_SIZE, 'left'),
  slot(WORLD_OFFSET_X + 17.4 * TILE_SIZE, WORLD_OFFSET_Y + 11.4 * TILE_SIZE, 'left'),
];

const IDLE_WANDER_PATH = [
  slot(WORLD_OFFSET_X + 12.1 * TILE_SIZE, WORLD_OFFSET_Y + 6.1 * TILE_SIZE, 'right'),
  slot(WORLD_OFFSET_X + 16.9 * TILE_SIZE, WORLD_OFFSET_Y + 6.6 * TILE_SIZE, 'left'),
  slot(WORLD_OFFSET_X + 19.1 * TILE_SIZE, WORLD_OFFSET_Y + 9.4 * TILE_SIZE, 'left'),
  slot(WORLD_OFFSET_X + 17.6 * TILE_SIZE, WORLD_OFFSET_Y + 12.1 * TILE_SIZE, 'left'),
  slot(WORLD_OFFSET_X + 14.1 * TILE_SIZE, WORLD_OFFSET_Y + 12.8 * TILE_SIZE, 'right'),
  slot(WORLD_OFFSET_X + 11.8 * TILE_SIZE, WORLD_OFFSET_Y + 9.8 * TILE_SIZE, 'right'),
];

const SOFA_RECOVERY_SLOTS = [
  slot(WORLD_OFFSET_X + 14.25 * TILE_SIZE, WORLD_OFFSET_Y + 10.55 * TILE_SIZE, 'down'),
  slot(WORLD_OFFSET_X + 16.35 * TILE_SIZE, WORLD_OFFSET_Y + 10.55 * TILE_SIZE, 'down'),
];

const ROAM_LANE = [
  slot(WORLD_OFFSET_X + 11.2 * TILE_SIZE, WORLD_OFFSET_Y + 6.2 * TILE_SIZE, 'right'),
  slot(WORLD_OFFSET_X + 11.8 * TILE_SIZE, WORLD_OFFSET_Y + 9.4 * TILE_SIZE, 'left'),
  slot(WORLD_OFFSET_X + 11.2 * TILE_SIZE, WORLD_OFFSET_Y + 12.1 * TILE_SIZE, 'right'),
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBubble(
  agent: AgentListItem,
  nowMs: number,
  deadlines: Record<string, number>,
): string | null {
  return deadlines[agent.agentId] > nowMs ? agent.overview.lastStepPreview : null;
}

function hashText(value: string): number {
  let hash = 0;
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash;
}

// ---------------------------------------------------------------------------
// Per-category builders
// ---------------------------------------------------------------------------

function buildRunning(input: BuildSceneAgentsInput, running: AgentListItem[]): SceneAgent[] {
  const result: SceneAgent[] = [];

  for (const [index, agent] of running.entries()) {
    const slot = RUNNING_SLOTS[index % RUNNING_SLOTS.length] ?? ROAM_LANE[index % ROAM_LANE.length];
    const isAnimating = input.animationDeadlines[agent.agentId] > input.nowMs;
    const isRoaming = index >= RUNNING_SLOTS.length;
    const ambientDeskPose = resolveDeskAmbientPose({
      agentId: agent.agentId,
      tick: input.tick,
      baseDir: slot.dir,
      state: input.deskAnimationState[agent.agentId],
    });
    const forceDeskDefault = ambientDeskPose === null;
    const deskBobOffset =
      forceDeskDefault && !isRoaming ? Math.sin((input.tick + index * 5) / 1.8) * 0.6 : 0;

    result.push({
      agent,
      agentId: agent.agentId,
      name: agent.name,
      x: slot.x + (!forceDeskDefault && isRoaming ? Math.sin(input.tick / 4 + index) * 6 : 0),
      y: slot.y + deskBobOffset,
      dir: forceDeskDefault ? slot.dir : ambientDeskPose.dir,
      frame: forceDeskDefault ? 3 + ((input.tick + index) % 2) : ambientDeskPose.frame,
      toolBubble: isAnimating ? agent.overview.lastToolBadge : null,
      bubble: makeBubble(agent, input.nowMs, input.bubbleDeadlines),
    });
  }

  return result;
}

function buildMemory(input: BuildSceneAgentsInput, memory: AgentListItem[]): SceneAgent[] {
  const result: SceneAgent[] = [];

  for (const [index, agent] of memory.entries()) {
    const slot = MEMORY_SLOTS[index % MEMORY_SLOTS.length];
    const isAnimating = input.animationDeadlines[agent.agentId] > input.nowMs;
    const workPhase = Math.floor((input.tick + index * 13) / 8) % 6;
    const bucket = Math.floor(input.tick / 24);
    const variant = hashText(`${agent.agentId}:memory:${bucket}`) % 6;

    const dir: SceneAgent['dir'] =
      variant <= 1 ? slot.dir : variant === 2 ? 'down' : variant === 3 ? 'left' : slot.dir;
    const frame: number = variant <= 1 ? 5 : 1;

    result.push({
      agent,
      agentId: agent.agentId,
      name: agent.name,
      x: slot.x,
      y: slot.y,
      dir: isAnimating ? (workPhase === 2 ? 'down' : dir) : dir,
      frame: isAnimating
        ? workPhase === 0 || workPhase === 1 || workPhase === 4
          ? 5 + ((input.tick + index) % 2)
          : 1
        : frame,
      toolBubble: isAnimating ? agent.overview.lastToolBadge : null,
      bubble: makeBubble(agent, input.nowMs, input.bubbleDeadlines),
    });
  }

  return result;
}

function buildIdle(input: BuildSceneAgentsInput, idle: AgentListItem[]): SceneAgent[] {
  const result: SceneAgent[] = [];

  for (const [index, agent] of idle.entries()) {
    const seed = hashText(agent.agentId);
    const idleBucket = Math.floor(input.tick / 20);
    const slot =
      IDLE_WANDER_PATH[(idleBucket + seed) % IDLE_WANDER_PATH.length] ??
      FOCUS_SLOTS[index % FOCUS_SLOTS.length];
    const isAnimating = input.animationDeadlines[agent.agentId] > input.nowMs;

    result.push({
      agent,
      agentId: agent.agentId,
      name: agent.name,
      x: slot.x,
      y: slot.y,
      dir: isAnimating ? (index % 2 === 0 ? slot.dir : 'right') : slot.dir,
      frame: isAnimating
        ? index % 3 === 0
          ? 5 + ((input.tick + index) % 2)
          : 1 + ((input.tick + index) % 2)
        : 1,
      toolBubble: isAnimating ? agent.overview.lastToolBadge : null,
      bubble: makeBubble(agent, input.nowMs, input.bubbleDeadlines),
    });
  }

  return result;
}

function buildAbsent(absent: AgentListItem[]): SceneAgent[] {
  return absent.map((agent) => {
    const slot = SOFA_RECOVERY_SLOTS[0];
    return {
      agent,
      agentId: agent.agentId,
      name: agent.name,
      x: slot.x,
      y: slot.y,
      dir: 'down' as const,
      frame: 0,
      toolBubble: null,
      bubble: null,
    };
  });
}

function buildHiring(tick: number): SceneAgent {
  const hiringPhase = Math.floor(tick / 10) % 12;
  const hiringWaypoint = hiringPhase < 4 ? 0 : hiringPhase < 8 ? 1 : 2;
  const hiringPositions = [
    {
      x: WORLD_OFFSET_X + 13.9 * TILE_SIZE,
      y: WORLD_OFFSET_Y + 4.3 * TILE_SIZE,
      dir: 'left' as const,
      frame: 5,
    },
    {
      x: WORLD_OFFSET_X + 15.4 * TILE_SIZE,
      y: WORLD_OFFSET_Y + 4.7 * TILE_SIZE,
      dir: 'right' as const,
      frame: 1,
    },
    {
      x: WORLD_OFFSET_X + 17.1 * TILE_SIZE,
      y: WORLD_OFFSET_Y + 4.4 * TILE_SIZE,
      dir: 'left' as const,
      frame: 5,
    },
  ];
  const hiringPosition = hiringPositions[hiringWaypoint];

  return {
    agentId: 'npc-rh',
    name: 'RH',
    x: hiringPosition.x,
    y: hiringPosition.y,
    dir: hiringPosition.dir,
    frame: hiringPhase % 2 === 0 ? hiringPosition.frame : 1,
    toolBubble: null,
    bubble: null,
    spriteSeed: 4,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildSceneAgents(input: BuildSceneAgentsInput): SceneAgent[] {
  const running = input.agents.filter(
    (a) => a.executionState === 'running' && !a.overview.ltm.running,
  );
  const memory = input.agents.filter((a) => a.overview.ltm.running);
  const absent = input.agents.filter((a) => a.executionState === 'absent');
  const idle = input.agents.filter((a) => a.executionState === 'idle' && !a.overview.ltm.running);

  return [
    ...buildRunning(input, running),
    ...buildMemory(input, memory),
    ...buildIdle(input, idle),
    ...buildAbsent(absent),
    buildHiring(input.tick),
  ];
}
