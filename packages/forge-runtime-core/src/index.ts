/* eslint-disable reexport-check/no-unnecessary-reexports, @typescript-eslint/strict-boolean-expressions */
export {
  createForgeConversationMemory,
  type ForgeConversationMemoryOptions,
} from './memory.js';
export {
  LibsqlConversationStore,
  type LibsqlConversationStoreOptions,
} from './libsql-conversation-store.js';
export {
  LibsqlTodoStore,
  createUpdateTodosAction,
  type LibsqlTodoStoreOptions,
  type TodoItem,
  type TodoItemInput,
  type TodoItemStatus,
  type UpdateTodosInput,
} from './libsql-todo-store.js';
export { RuntimePlanMode } from './runtime-plan-mode.js';
export type {
  AgentConfig,
} from './agent-config.js';
export {
  createTool,
  toolToRuntimeAction,
  toolsToRuntimeActions,
  type Tool,
  type ToolsInput,
} from './tools.js';
export {
  AiSdkStepModelAdapter,
  ConfiguredWorkspaceGateway,
  createWorkspaceActionDefinitions,
  FilesystemDocumentSource,
  RuntimeRunController,
  createDefaultContextFormatter,
  LocalBashWorkspaceGateway,
  LocalWorkspaceFilesystem,
  createRuntimeHost,
  createTextStepContextEntry,
} from 'agent-runtime-core/integrations';
export type {
  ConversationStore,
  RuntimeActionDefinition,
} from 'agent-runtime-core/integrations';
export {
  ForgeMcpToolset,
  type ForgeMcpToolsetOptions,
} from './mcp.js';
export {
  createForgeAgentRuntime,
  type CreateForgeAgentRuntimeOptions,
  type ForgeAgentRuntime,
} from './runtime.js';
export {
  createRuntimeAgentSession,
  type CreateRuntimeAgentSessionOptions,
  type RuntimeAgentSession,
  type RuntimeAgentSessionGenerateMessage,
  type RuntimeAgentSessionGenerateOptions,
  type RuntimeAgentSessionIteration,
  type RuntimeAgentSessionOmTraceEvent,
  type RuntimeAgentSessionStepResult,
} from './runtime-agent-session.js';
export {
  runNativeToolLoop,
  type NativeToolLoopDeferredCall,
  type NativeToolLoopMessage,
  type NativeToolLoopResult,
} from './native-tool-loop.js';
export {
  createForgeUsageObserver,
  InMemoryForgeUsageSink,
  type ForgeStepUsageRecord,
  type ForgeUsageSink,
} from './usage.js';
export {
  CLAUDE_MAX_MODELS,
  type ClaudeMaxModelId,
} from './model-ids.js';
export {
  OPENAI_CODEX_MODELS,
  type OpenAICodexModelId,
} from './model-ids.js';
export {
  claudeCodeProvider,
} from './claude-max.js';
export {
  openaiCodexProvider,
} from './openai-codex.js';
export {
  createOAuthGateway,
  OAUTH_GATEWAY_ID,
  wrapAnthropicPromptCacheModel,
  type OAuthGateway,
  type OAuthGatewayOptions,
} from './oauth-gateway.js';
export {
  getAnthropicCliAuthFilePath,
  getAnthropicSetupTokenFilePath,
  resolveAnthropicCredential,
  syncAnthropicCredential,
} from './oauth-anthropic.js';
export {
  getOpenAICodexCliAuthFilePath,
  resolveOpenAICodexCredential,
  syncOpenAICodexCredential,
} from './oauth-openai-codex.js';
export {
  createOAuthStore,
  oauthStore,
  type OAuthCredential,
  type ProviderId,
} from './oauth-store.js';
export {
  embedTextWithFastembed,
  embedTextWithWorkspaceEmbedder,
  getFastembedSingleton,
  getWorkspaceEmbedderProvider,
  isWorkspaceEmbedderId,
  resolveWorkspaceEmbedderId,
  WORKSPACE_EMBEDDER_IDS,
  type WorkspaceEmbedderId,
  type WorkspaceEmbedderProvider,
} from './embedder.js';
export {
  createAgentWakeQueue,
  type AgentWakeEvent,
  type AgentWakeQueue,
} from './wake-queue.js';
export {
  forgeDebug,
  isForgeDebugEnabled,
} from './debug.js';
export {
  toForgeSafeIdentifier,
  toForgeSafeIdentifier as toRuntimeSafeIdentifier,
  toForgeSafeIdentifier as toMastraSafeIdentifier,
} from './safe-identifier.js';
export type {
  OperationalMemoryOmArchivedObservation,
  OperationalMemoryOmArchivedReflection,
  OperationalMemoryOmCheckpointPackageInput,
  OperationalMemoryOmCheckpointSummary,
  OperationalMemoryOmMetricsSnapshot,
  OperationalMemoryOmObservationBlock,
  OperationalMemoryOmState,
  OperationalMemoryOmStateStore,
} from './operational-memory-om.js';
export {
  readOperationalMemoryState,
  takeOperationalMemoryBatch,
  estimateMessageUnits,
  type OperationalMemoryState,
} from './operational-memory-state.js';
export type {
  CommunicationAttachmentView,
  CommunicationContactView,
  CommunicationConversationView,
  CommunicationFile,
  CommunicationInboundMessage,
  CommunicationMessageView,
  CommunicationModule,
  CommunicationProvider,
  CommunicationProviderContact,
  CommunicationProviderConversation,
  CommunicationProviderMessage,
} from './communication.js';
export {
  createCommunicationModule,
} from './communication-module.js';
export type {
  CommunicationContactsStore,
} from './communication-module.js';
export {
  LibsqlCommunicationContactsStore,
  type LibsqlCommunicationContactsStoreOptions,
} from './libsql-communication-contacts-store.js';
export {
  SqliteWorkspaceRetrieval,
  type SqliteWorkspaceRetrievalOptions,
} from './sqlite-workspace-retrieval.js';
export {
  createExternalAccountTools,
} from './communication-tools.js';
export {
  forgeAgentRuntimeConfigSchema,
  forgeMcpHttpServerSchema,
  forgeMcpServerSchema,
  forgeMcpStdioServerSchema,
  type ForgeAgentRuntimeConfig,
  type ForgeMcpServerConfig,
} from './contracts.js';
export {
  appendWorkingMemoryInstructions,
  sanitizeWorkingMemory,
  WORKING_MEMORY_INSTRUCTIONS,
  WORKING_MEMORY_SCHEMA,
  type WorkingMemoryAccess,
} from './working-memory.js';
export {
  createUpdateWorkingMemoryTool,
  createWorkingMemoryContextEntry,
  createWorkingMemoryPlugin,
  type RuntimeWorkingMemoryStore,
  type WorkingMemoryRecord,
} from './runtime-working-memory.js';
export { logger } from './logger.js';
