/**
 * Settings — shared types and helpers for the settings page and its sub-sections.
 * Centralises the type definitions that are shared between SettingsGeneralRoute
 * and its child section components.
 */
import type { SystemSettings } from '@/lib/admin-api';

/* ── Draft shapes ─────────────────────────────────────────────── */

export type CompanyDraft = Pick<SystemSettings, 'companyName' | 'companyContext'>;

export type OperationsDraft = Pick<
  SystemSettings,
  | 'stepDelayEnabled'
  | 'communicationDmFlushingEnabled'
  | 'communicationGroupFlushingEnabled'
>;

export type RuntimeDraft = Pick<
  SystemSettings,
  | 'memoryLastMessagesFullEnabled'
  | 'memoryLastMessagesCount'
  | 'tokenCountFilterEnabled'
  | 'tokenCountFilterLimit'
  | 'checkpointedOmEnabled'
  | 'checkpointedOmTotalContextTokens'
  | 'checkpointedOmRecentRawTokens'
  | 'checkpointedOmRawObservationBatchTokens'
  | 'checkpointedOmObservationReflectionBatchTokens'
  | 'checkpointedOmObservationSupportTokens'
  | 'checkpointedOmReflectionSupportTokens'
  | 'ltmRecallScoreThreshold'
  | 'ltmRecallDocumentCount'
>;

export type DefaultsDraft = {
  primaryProfileId: string;
  omProfileId: string;
  hiringRhProfileId: string;
};

/* ── Shared mutation shape ─────────────────────────────────────── */

export type SettingsMutation = {
  mutate: (data: SystemSettings) => void;
  isPending: boolean;
  error: { message: string } | null;
};

/* ── Settings query shape ─────────────────────────────────────── */

export type SettingsQuery = {
  data: SystemSettings | undefined;
  isLoading: boolean;
  error: { message: string } | null;
};

/* ── Helpers ──────────────────────────────────────────────────── */

export function toRuntimeDraft(data: SystemSettings): RuntimeDraft {
  return {
    memoryLastMessagesFullEnabled: data.memoryLastMessagesFullEnabled,
    memoryLastMessagesCount: String(data.memoryLastMessagesCount),
    tokenCountFilterEnabled: data.tokenCountFilterEnabled,
    tokenCountFilterLimit: String(data.tokenCountFilterLimit),
    checkpointedOmEnabled: data.checkpointedOmEnabled,
    checkpointedOmTotalContextTokens: String(data.checkpointedOmTotalContextTokens),
    checkpointedOmRecentRawTokens: String(data.checkpointedOmRecentRawTokens),
    checkpointedOmRawObservationBatchTokens: String(data.checkpointedOmRawObservationBatchTokens),
    checkpointedOmObservationReflectionBatchTokens: String(data.checkpointedOmObservationReflectionBatchTokens),
    checkpointedOmObservationSupportTokens: String(data.checkpointedOmObservationSupportTokens),
    checkpointedOmReflectionSupportTokens: String(data.checkpointedOmReflectionSupportTokens),
    ltmRecallScoreThreshold: String(data.ltmRecallScoreThreshold),
    ltmRecallDocumentCount: String(data.ltmRecallDocumentCount),
  };
}

export function fromRuntimeDraft(draft: RuntimeDraft, base: SystemSettings): SystemSettings {
  return {
    ...base,
    memoryLastMessagesFullEnabled: draft.memoryLastMessagesFullEnabled,
    memoryLastMessagesCount: Number(draft.memoryLastMessagesCount),
    tokenCountFilterEnabled: draft.tokenCountFilterEnabled,
    tokenCountFilterLimit: Number(draft.tokenCountFilterLimit),
    checkpointedOmEnabled: draft.checkpointedOmEnabled,
    checkpointedOmTotalContextTokens: Number(draft.checkpointedOmTotalContextTokens),
    checkpointedOmRecentRawTokens: Number(draft.checkpointedOmRecentRawTokens),
    checkpointedOmRawObservationBatchTokens: Number(draft.checkpointedOmRawObservationBatchTokens),
    checkpointedOmObservationReflectionBatchTokens: Number(draft.checkpointedOmObservationReflectionBatchTokens),
    checkpointedOmObservationSupportTokens: Number(draft.checkpointedOmObservationSupportTokens),
    checkpointedOmReflectionSupportTokens: Number(draft.checkpointedOmReflectionSupportTokens),
    ltmRecallScoreThreshold: Number(draft.ltmRecallScoreThreshold),
    ltmRecallDocumentCount: Number(draft.ltmRecallDocumentCount),
  };
}

export function toOperationsDraft(data: SystemSettings): OperationsDraft {
  return {
    stepDelayEnabled: data.stepDelayEnabled,
    communicationDmFlushingEnabled: data.communicationDmFlushingEnabled,
    communicationGroupFlushingEnabled: data.communicationGroupFlushingEnabled,
  };
}

function fromOperationsDraft(draft: OperationsDraft, base: SystemSettings): SystemSettings {
  return {
    ...base,
    stepDelayEnabled: draft.stepDelayEnabled,
    communicationDmFlushingEnabled: draft.communicationDmFlushingEnabled,
    communicationGroupFlushingEnabled: draft.communicationGroupFlushingEnabled,
  };
}