import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

import type { WorldCommand, WorldEvent, WorldGateway } from './world.js';

export type FilesystemWorldGatewayOptions = {
  basePath: string;
};

const worldEventSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  text: z.string(),
  actorId: z.string().optional(),
  locationId: z.string().optional(),
  createdAt: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const worldCommandSchema = z.object({
  type: z.string().min(1),
  actorId: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

const worldStateSchema = z.object({
  events: z.array(worldEventSchema),
  commands: z.array(worldCommandSchema),
});

type WorldState = z.infer<typeof worldStateSchema>;

export class FilesystemWorldGateway implements WorldGateway {
  private readonly basePath: string;

  constructor(options: FilesystemWorldGatewayOptions) {
    this.basePath = options.basePath;
  }

  async emitEvent(event: WorldEvent): Promise<void> {
    const state = await this.readState();
    state.events.push(worldEventSchema.parse(event));
    await this.writeState(state);
  }

  async readRecentEvents(input: { actorId?: string; limit?: number }): Promise<WorldEvent[]> {
    const state = await this.readState();
    const filteredEvents = input.actorId
      ? state.events.filter((event) => event.actorId === input.actorId || !event.actorId)
      : state.events;
    const limit = input.limit ?? 10;

    return filteredEvents.slice(-limit);
  }

  async applyCommand(command: WorldCommand): Promise<void> {
    const state = await this.readState();
    state.commands.push(worldCommandSchema.parse(command));
    await this.writeState(state);
  }

  async readCommands(): Promise<WorldCommand[]> {
    const state = await this.readState();
    return state.commands;
  }

  private async readState(): Promise<WorldState> {
    try {
      const raw = await readFile(this.getFilePath(), 'utf8');
      return worldStateSchema.parse(JSON.parse(raw));
    } catch {
      return {
        events: [],
        commands: [],
      };
    }
  }

  private async writeState(state: WorldState): Promise<void> {
    await mkdir(this.basePath, { recursive: true });
    await writeFile(this.getFilePath(), JSON.stringify(state, null, 2), 'utf8');
  }

  private getFilePath() {
    return join(this.basePath, 'world.json');
  }
}
