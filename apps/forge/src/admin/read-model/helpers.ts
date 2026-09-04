/**
 * @deprecated Use the thematic helpers files directly. This barrel will be
 * removed 30 days after D49 #6491 (target removal: ~Sep 17 2026).
 *
 * Thematic decomposition (D49 #6491, "junk drawer 592 LOC → 6 thematic files"):
 *   - ./helpers-type-guards          (isNonNullObject, hasToolCallId, hasToolName, isMemoryRecallText, isTextPart, partsOfContent)
 *   - ./helpers-debug                (adminDebug — shared L#NN-YYY v4 single-scope helper)
 *   - ./helpers-memory-formatting    (splitMemoryRecallSegments)
 *   - ./helpers-message-preview      (truncatePreview, toToolBadge, extractLatestMessagePreview, extractLatestMessageToolBadge, collectConversationParticipants)
 *   - ./helpers-tool-invocation      (mergeToolLogMessages, buildThreadToolInvocationParts)
 *   - ./helpers-schedule-crypto      (toScheduleSummary, ScheduleSummary, decryptProviderConfig)
 *
 * Migration: update imports from './helpers' to the specific thematic file.
 */

// eslint-disable-next-line reexport-check/no-unnecessary-reexports -- Back-compat shim during helpers.ts migration; remove when 0 consumers
export {
  isNonNullObject,
  hasToolCallId,
  hasToolName,
  isMemoryRecallText,
  isTextPart,
  partsOfContent,
} from './helpers-type-guards';
// eslint-disable-next-line reexport-check/no-unnecessary-reexports -- Back-compat shim during helpers.ts migration; remove when 0 consumers
export type { MessagePart, TextPart } from './helpers-type-guards';

// Back-compat shim: callers update their imports to `./helpers-debug` (migration in progress)
// eslint-disable-next-line reexport-check/no-unnecessary-reexports -- Back-compat shim during helpers.ts migration to thematic files; remove when 0 consumers
export { adminDebug } from './helpers-debug';

// eslint-disable-next-line reexport-check/no-unnecessary-reexports -- Back-compat shim during helpers.ts migration; remove when 0 consumers
export {
  splitMemoryRecallSegments,
} from './helpers-memory-formatting';

// eslint-disable-next-line reexport-check/no-unnecessary-reexports -- Back-compat shim during helpers.ts migration; remove when 0 consumers
export {
  truncatePreview,
  toToolBadge,
  extractLatestMessagePreview,
  extractLatestMessageToolBadge,
  collectConversationParticipants,
} from './helpers-message-preview';

// eslint-disable-next-line reexport-check/no-unnecessary-reexports -- Back-compat shim during helpers.ts migration; remove when 0 consumers
export {
  mergeToolLogMessages,
  buildThreadToolInvocationParts,
} from './helpers-tool-invocation';

// eslint-disable-next-line reexport-check/no-unnecessary-reexports -- Back-compat shim during helpers.ts migration; remove when 0 consumers
export {
  toScheduleSummary,
  decryptProviderConfig,
} from './helpers-schedule-crypto';
// eslint-disable-next-line reexport-check/no-unnecessary-reexports -- Back-compat shim during helpers.ts migration; remove when 0 consumers
export type { ScheduleSummary } from './helpers-schedule-crypto';
