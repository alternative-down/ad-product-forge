import type { WorldCommand, WorldEvent, WorldGateway } from './world.js';

export class InMemoryWorldGateway implements WorldGateway {
  private readonly events: WorldEvent[] = [];
  private readonly commands: WorldCommand[] = [];

  async emitEvent(event: WorldEvent): Promise<void> {
    await Promise.resolve();
    this.events.push(event);
  }

  async readRecentEvents(input: { actorId?: string; limit?: number }): Promise<WorldEvent[]> {
  await Promise.resolve();
    const filtered = input.actorId != null
      ? this.events.filter((event) => event.actorId === input.actorId || event.actorId == null)
      : this.events;
    const limit = input.limit ?? 10;

    return filtered.slice(-limit);
  }

  async applyCommand(command: WorldCommand): Promise<void> {
    await Promise.resolve();
    this.commands.push(command);
  }

  getCommands() {
    return [...this.commands];
  }
}
