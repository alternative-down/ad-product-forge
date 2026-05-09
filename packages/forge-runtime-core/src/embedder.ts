/* eslint-disable reexport-check/no-unnecessary-reexports */
export {
  embedTextWithFastembed,
  embedTextWithWorkspaceEmbedder,
  getFastembedSingleton,
  getWorkspaceEmbedderProvider,
  isWorkspaceEmbedderId,
  resolveWorkspaceEmbedderId,
  WORKSPACE_EMBEDDER_IDS,
} from './agent/memory/embedder.js';
export type {
  WorkspaceEmbedderId,
  WorkspaceEmbedderProvider,
} from './agent/memory/embedder.js';
