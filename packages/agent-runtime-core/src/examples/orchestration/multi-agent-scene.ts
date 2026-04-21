import type { RunExecutionResult } from '../../core/types.js';
import type { WorldGateway } from '../gateways/world.js';

export type SceneRuntime = {
  runtimeId: string;
  observeWorld(limit?: number): Promise<void>;
  tick(options?: { maxSteps?: number }): Promise<RunExecutionResult>;
};

export type MultiAgentSceneOptions = {
  world: WorldGateway;
  agents: SceneRuntime[];
};

export class MultiAgentScene {
  private readonly world: WorldGateway;
  private readonly agents: SceneRuntime[];

  constructor(options: MultiAgentSceneOptions) {
    this.world = options.world;
    this.agents = [...options.agents];
  }

  async broadcastEvent(event: {
    id: string;
    type: string;
    text: string;
    locationId?: string;
    metadata?: Record<string, unknown>;
    createdAt?: string;
  }) {
    await this.world.emitEvent({
      ...event,
      createdAt: event.createdAt ?? new Date().toISOString(),
    });
  }

  async tick(options: { perAgentMaxSteps?: number; observationLimit?: number } = {}) {
    const results: RunExecutionResult[] = [];

    for (const agent of this.agents) {
      await agent.observeWorld(options.observationLimit);
      results.push(await agent.tick({
        maxSteps: options.perAgentMaxSteps,
      }));
    }

    return results;
  }
}
