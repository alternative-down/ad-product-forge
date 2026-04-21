import type { AgentRuntimeOptions } from '../../core/runtime.js';
import type { WorldEvent, WorldGateway } from '../gateways/world.js';
import { InMemoryRelationshipStore } from '../domain/relationships/in-memory-relationship-store.js';
import type { RelationshipStore } from '../domain/relationships/relationship-store.js';
import { z } from 'zod';

import { createRuntimeHost } from '../../integrations/hosts/runtime-host.js';

export type NpcWorldApplicationOptions = {
  runtime: AgentRuntimeOptions;
  actorId: string;
  world: WorldGateway;
  relationships?: RelationshipStore;
};

export function createNpcWorldApplication(options: NpcWorldApplicationOptions) {
  const host = createRuntimeHost({
    runtime: options.runtime,
  });
  const relationships = options.relationships ?? new InMemoryRelationshipStore();

  host.runtime.registerAction({
    name: 'world_command',
    description: 'Apply a command to the world on behalf of this actor.',
    inputSchema: z.object({
      type: z.string().min(1),
      actorId: z.string().optional(),
      payload: z.record(z.string(), z.unknown()).optional(),
    }),
    execute(input) {
      return options.world.applyCommand({
        type: input.type,
        actorId: input.actorId ?? options.actorId,
        payload: input.payload,
      });
    },
  });
  host.runtime.registerAction({
    name: 'world_emit_event',
    description: 'Emit a world event from this actor or another actor.',
    inputSchema: z.object({
      id: z.string().min(1),
      type: z.string().min(1),
      text: z.string(),
      actorId: z.string().optional(),
      locationId: z.string().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }),
    async execute(input) {
      const event = {
        ...input,
        actorId: input.actorId ?? options.actorId,
        createdAt: new Date().toISOString(),
      };
      await options.world.emitEvent(event);
      return event;
    },
  });
  host.runtime.registerAction({
    name: 'world_read_recent_events',
    description: 'Read recent world events visible to this actor.',
    inputSchema: z.object({
      actorId: z.string().optional(),
      limit: z.number().int().positive().optional(),
    }),
    execute(input) {
      return options.world.readRecentEvents({
        actorId: input.actorId ?? options.actorId,
        limit: input.limit,
      });
    },
  });
  host.runtime.registerAction({
    name: 'relationship_set',
    description: 'Create or update a social relationship record between two actors.',
    inputSchema: z.object({
      sourceId: z.string().min(1),
      targetId: z.string().min(1),
      kind: z.string().min(1),
      value: z.number().optional(),
      summary: z.string().optional(),
    }),
    async execute(input) {
      const record = {
        ...input,
        updatedAt: new Date().toISOString(),
      };
      await relationships.upsert(record);
      return record;
    },
  });
  host.runtime.registerAction({
    name: 'relationship_read_between',
    description: 'Read relationship records between two actors.',
    inputSchema: z.object({
      sourceId: z.string().min(1),
      targetId: z.string().min(1),
      kind: z.string().optional(),
    }),
    execute(input) {
      return relationships.readBetween(input);
    },
  });
  host.runtime.registerAction({
    name: 'relationship_read_for_actor',
    description: 'Read all relationship records that involve a given actor.',
    inputSchema: z.object({
      actorId: z.string().optional(),
    }),
    execute(input) {
      return relationships.readForActor(input.actorId ?? options.actorId);
    },
  });

  return {
    runtime: host.runtime,
    journal: host.journal,
    notes: host.notes,
    relationships,
    async observeWorld(limit = 10) {
      const recentEvents = await options.world.readRecentEvents({
        actorId: options.actorId,
        limit,
      });

      for (const event of recentEvents) {
        await host.runtime.dispatch({
          id: event.id,
          type: `world:${event.type}`,
          payload: event,
        });
      }
    },
    async emitWorldEvent(event: Omit<WorldEvent, 'createdAt'> & { createdAt?: string }) {
      await options.world.emitEvent({
        ...event,
        createdAt: event.createdAt ?? new Date().toISOString(),
      });
    },
    async setRelationship(input: {
      sourceId?: string;
      targetId: string;
      kind: string;
      value?: number;
      summary?: string;
    }) {
      const record = {
        sourceId: input.sourceId ?? options.actorId,
        targetId: input.targetId,
        kind: input.kind,
        value: input.value,
        summary: input.summary,
        updatedAt: new Date().toISOString(),
      };
      await relationships.upsert(record);
      return record;
    },
    async tick(options: { maxSteps?: number } = {}) {
      return host.runtime.run(options);
    },
    async readRecentEvents(limit = 10) {
      return options.world.readRecentEvents({
        actorId: options.actorId,
        limit,
      });
    },
    async readRelationshipsForActor(actorId = options.actorId) {
      return relationships.readForActor(actorId);
    },
  };
}
