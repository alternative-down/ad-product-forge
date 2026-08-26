/**
 * @internal
 *
 * Workspace-internal examples entry for `agent-runtime-core`.
 * All 39 exports here are dead from both `apps/` AND from any test
 * in the workspace (verified D57 2026-08-26). Kept for downstream
 * consumers and documentation purposes.
 *
 * See `docs/dead-exports-audit-d57-2026-08-26.md` for the full audit.
 * See issue #6703 for the original sweep findings.
 */

export {
  createAutonomousAgentApplication,
  type AutonomousAgentApplicationOptions,
  type AutonomousTickOptions,
} from './applications/autonomous-agent.js';
export {
  createBrowserResearchApplication,
  type BrowserResearchApplicationOptions,
} from './applications/browser-research.js';
export {
  createNpcWorldApplication,
  type NpcWorldApplicationOptions,
} from './applications/npc-world.js';
export {
  createStoryNarratorApplication,
  type StoryNarratorApplicationOptions,
} from './applications/story-narrator.js';
export { createVtuberApplication, type VtuberApplicationOptions } from './applications/vtuber.js';
export {
  createWorkspaceAgentApplication,
  type WorkspaceAgentApplicationOptions,
} from './applications/workspace-agent.js';
export { InMemoryRelationshipStore } from './domain/relationships/in-memory-relationship-store.js';
export type {
  RelationshipRecord,
  RelationshipStore,
} from './domain/relationships/relationship-store.js';
export { InMemoryStoryEventStore } from './domain/story/in-memory-story-event-store.js';
export type { StoryEvent, StoryEventStore } from './domain/story/story-events.js';
export {
  FilesystemWorldGateway,
  type FilesystemWorldGatewayOptions,
} from './gateways/filesystem-world.js';
export { InMemoryWorldGateway } from './gateways/in-memory-world.js';
export type { WorldCommand, WorldEvent, WorldGateway } from './gateways/world.js';
export { AvatarDirector, type AvatarDirectorOptions } from './orchestration/avatar-director.js';
export {
  MultiAgentScene,
  type SceneRuntime,
  type MultiAgentSceneOptions,
} from './orchestration/multi-agent-scene.js';
export {
  RealtimeVoiceAgent,
  RealtimeVoiceAgentSession,
  createRealtimeTranscriptEvent,
  type RealtimeVoiceAgentOptions,
  type RealtimeVoiceAgentSessionOptions,
} from './orchestration/realtime-voice-agent.js';
export {
  FilesystemRelationshipStore,
  type FilesystemRelationshipStoreOptions,
} from './persistence/filesystem-relationship-store.js';
export {
  FilesystemStoryEventStore,
  type FilesystemStoryEventStoreOptions,
} from './persistence/filesystem-story-event-store.js';
