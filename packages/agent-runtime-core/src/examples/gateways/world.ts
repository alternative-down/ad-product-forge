export type WorldEvent = {
  id: string;
  type: string;
  text: string;
  actorId?: string;
  locationId?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export type WorldCommand = {
  type: string;
  actorId?: string;
  payload?: Record<string, unknown>;
};

export interface WorldGateway {
  emitEvent(event: WorldEvent): Promise<void>;
  readRecentEvents(input: { actorId?: string; limit?: number }): Promise<WorldEvent[]>;
  applyCommand(command: WorldCommand): Promise<void>;
}
