import { eq } from 'drizzle-orm';

import type { Database } from '../database';
import { systemSettings } from '../database/schema';

const SYSTEM_SETTINGS_ID = 'global';

function resolveRecallSearchMode(value: string | null | undefined) {
  if (value === 'vector' || value === 'bm25') {
    return value;
  }

  return 'hybrid' as const;
}

const DEFAULT_SYSTEM_SETTINGS = {
  companyName: '',
  companyContext: '',
  stepDelayEnabled: true,
  communicationDmFlushingEnabled: true,
  communicationGroupFlushingEnabled: true,
  memoryLastMessagesFullEnabled: false,
  memoryLastMessagesCount: 20,
  tokenCountFilterEnabled: true,
  tokenCountFilterLimit: 100000,
  checkpointedOmEnabled: false,
  checkpointedOmTotalContextTokens: 50000,
  checkpointedOmRecentRawTokens: 10000,
  checkpointedOmRawObservationBatchTokens: 5000,
  checkpointedOmObservationReflectionBatchTokens: 5000,
  checkpointedOmObservationSupportTokens: 2000,
  checkpointedOmReflectionSupportTokens: 2000,
  ltmRecallSearchMode: 'hybrid',
  ltmRecallGraphTopK: 3,
  ltmRecallGraphThreshold: 0.7,
  ltmRecallGraphRandomWalkSteps: 50,
  ltmRecallGraphIncludeSources: true,
  ltmRecallScoreThreshold: 0.7,
  ltmRecallDocumentCount: 3,
} as const;

type SystemSettingsInput = {
  companyName: string;
  companyContext: string;
  stepDelayEnabled: boolean;
  communicationDmFlushingEnabled: boolean;
  communicationGroupFlushingEnabled: boolean;
  memoryLastMessagesFullEnabled: boolean;
  memoryLastMessagesCount: number;
  tokenCountFilterEnabled: boolean;
  tokenCountFilterLimit: number;
  checkpointedOmEnabled: boolean;
  checkpointedOmTotalContextTokens: number;
  checkpointedOmRecentRawTokens: number;
  checkpointedOmRawObservationBatchTokens: number;
  checkpointedOmObservationReflectionBatchTokens: number;
  checkpointedOmObservationSupportTokens: number;
  checkpointedOmReflectionSupportTokens: number;
  ltmRecallSearchMode: 'hybrid' | 'vector' | 'bm25';
  ltmRecallGraphTopK: number;
  ltmRecallGraphThreshold: number;
  ltmRecallGraphRandomWalkSteps: number;
  ltmRecallGraphIncludeSources: boolean;
  ltmRecallScoreThreshold: number;
  ltmRecallDocumentCount: number;
};

export type SystemSettingsValue = SystemSettingsInput & {
  updatedAt: number | null;
};

export function createSystemSettingsStore(db: Database) {
  async function getSettings(): Promise<SystemSettingsValue> {
    const row = await db.query.systemSettings.findFirst({
      where: eq(systemSettings.id, SYSTEM_SETTINGS_ID),
    });

    return {
      companyName: row?.companyName ?? DEFAULT_SYSTEM_SETTINGS.companyName,
      companyContext: row?.companyContext ?? DEFAULT_SYSTEM_SETTINGS.companyContext,
      stepDelayEnabled: row ? row.stepDelayEnabled === 1 : DEFAULT_SYSTEM_SETTINGS.stepDelayEnabled,
      communicationDmFlushingEnabled: row
        ? row.communicationDmFlushingEnabled === 1
        : DEFAULT_SYSTEM_SETTINGS.communicationDmFlushingEnabled,
      communicationGroupFlushingEnabled: row
        ? row.communicationGroupFlushingEnabled === 1
        : DEFAULT_SYSTEM_SETTINGS.communicationGroupFlushingEnabled,
      memoryLastMessagesFullEnabled: row
        ? row.memoryLastMessagesFullEnabled === 1
        : DEFAULT_SYSTEM_SETTINGS.memoryLastMessagesFullEnabled,
      memoryLastMessagesCount:
        row?.memoryLastMessagesCount ?? DEFAULT_SYSTEM_SETTINGS.memoryLastMessagesCount,
      tokenCountFilterEnabled: row
        ? row.tokenCountFilterEnabled === 1
        : DEFAULT_SYSTEM_SETTINGS.tokenCountFilterEnabled,
      tokenCountFilterLimit: row?.tokenCountFilterLimit ?? DEFAULT_SYSTEM_SETTINGS.tokenCountFilterLimit,
      checkpointedOmEnabled: row
        ? row.checkpointedOmEnabled === 1
        : DEFAULT_SYSTEM_SETTINGS.checkpointedOmEnabled,
      checkpointedOmTotalContextTokens:
        row?.checkpointedOmTotalContextTokens ?? DEFAULT_SYSTEM_SETTINGS.checkpointedOmTotalContextTokens,
      checkpointedOmRecentRawTokens:
        row?.checkpointedOmRecentRawTokens ?? DEFAULT_SYSTEM_SETTINGS.checkpointedOmRecentRawTokens,
      checkpointedOmRawObservationBatchTokens:
        row?.checkpointedOmRawObservationBatchTokens ?? DEFAULT_SYSTEM_SETTINGS.checkpointedOmRawObservationBatchTokens,
      checkpointedOmObservationReflectionBatchTokens:
        row?.checkpointedOmObservationReflectionBatchTokens
        ?? DEFAULT_SYSTEM_SETTINGS.checkpointedOmObservationReflectionBatchTokens,
      checkpointedOmObservationSupportTokens:
        row?.checkpointedOmObservationSupportTokens
        ?? DEFAULT_SYSTEM_SETTINGS.checkpointedOmObservationSupportTokens,
      checkpointedOmReflectionSupportTokens:
        row?.checkpointedOmReflectionSupportTokens
        ?? DEFAULT_SYSTEM_SETTINGS.checkpointedOmReflectionSupportTokens,
      ltmRecallSearchMode:
        resolveRecallSearchMode(row?.ltmRecallSearchMode),
      ltmRecallGraphTopK:
        row?.ltmRecallGraphTopK ?? DEFAULT_SYSTEM_SETTINGS.ltmRecallGraphTopK,
      ltmRecallGraphThreshold:
        row?.ltmRecallGraphThreshold ?? DEFAULT_SYSTEM_SETTINGS.ltmRecallGraphThreshold,
      ltmRecallGraphRandomWalkSteps:
        row?.ltmRecallGraphRandomWalkSteps ?? DEFAULT_SYSTEM_SETTINGS.ltmRecallGraphRandomWalkSteps,
      ltmRecallGraphIncludeSources: row
        ? row.ltmRecallGraphIncludeSources === 1
        : DEFAULT_SYSTEM_SETTINGS.ltmRecallGraphIncludeSources,
      ltmRecallScoreThreshold:
        row?.ltmRecallScoreThreshold ?? DEFAULT_SYSTEM_SETTINGS.ltmRecallScoreThreshold,
      ltmRecallDocumentCount:
        row?.ltmRecallDocumentCount ?? DEFAULT_SYSTEM_SETTINGS.ltmRecallDocumentCount,
      updatedAt: row?.updatedAt ?? null,
    } satisfies SystemSettingsValue;
  }

  async function upsertSettings(input: SystemSettingsInput): Promise<SystemSettingsValue> {
    const now = Date.now();

    await db
      .insert(systemSettings)
      .values({
        id: SYSTEM_SETTINGS_ID,
        companyName: input.companyName,
        companyContext: input.companyContext,
        stepDelayEnabled: input.stepDelayEnabled ? 1 : 0,
        communicationDmFlushingEnabled: input.communicationDmFlushingEnabled ? 1 : 0,
        communicationGroupFlushingEnabled: input.communicationGroupFlushingEnabled ? 1 : 0,
        memoryLastMessagesFullEnabled: input.memoryLastMessagesFullEnabled ? 1 : 0,
        memoryLastMessagesCount: input.memoryLastMessagesCount,
        tokenCountFilterEnabled: input.tokenCountFilterEnabled ? 1 : 0,
        tokenCountFilterLimit: input.tokenCountFilterLimit,
        checkpointedOmEnabled: input.checkpointedOmEnabled ? 1 : 0,
        checkpointedOmTotalContextTokens: input.checkpointedOmTotalContextTokens,
        checkpointedOmRecentRawTokens: input.checkpointedOmRecentRawTokens,
        checkpointedOmRawObservationBatchTokens: input.checkpointedOmRawObservationBatchTokens,
        checkpointedOmObservationReflectionBatchTokens:
          input.checkpointedOmObservationReflectionBatchTokens,
        checkpointedOmObservationSupportTokens: input.checkpointedOmObservationSupportTokens,
        checkpointedOmReflectionSupportTokens: input.checkpointedOmReflectionSupportTokens,
        ltmRecallSearchMode: input.ltmRecallSearchMode,
        ltmRecallGraphTopK: input.ltmRecallGraphTopK,
        ltmRecallGraphThreshold: input.ltmRecallGraphThreshold,
        ltmRecallGraphRandomWalkSteps: input.ltmRecallGraphRandomWalkSteps,
        ltmRecallGraphIncludeSources: input.ltmRecallGraphIncludeSources ? 1 : 0,
        ltmRecallScoreThreshold: input.ltmRecallScoreThreshold,
        ltmRecallDocumentCount: input.ltmRecallDocumentCount,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: systemSettings.id,
        set: {
          companyName: input.companyName,
          companyContext: input.companyContext,
          stepDelayEnabled: input.stepDelayEnabled ? 1 : 0,
          communicationDmFlushingEnabled: input.communicationDmFlushingEnabled ? 1 : 0,
          communicationGroupFlushingEnabled: input.communicationGroupFlushingEnabled ? 1 : 0,
          memoryLastMessagesFullEnabled: input.memoryLastMessagesFullEnabled ? 1 : 0,
          memoryLastMessagesCount: input.memoryLastMessagesCount,
          tokenCountFilterEnabled: input.tokenCountFilterEnabled ? 1 : 0,
          tokenCountFilterLimit: input.tokenCountFilterLimit,
          checkpointedOmEnabled: input.checkpointedOmEnabled ? 1 : 0,
          checkpointedOmTotalContextTokens: input.checkpointedOmTotalContextTokens,
          checkpointedOmRecentRawTokens: input.checkpointedOmRecentRawTokens,
          checkpointedOmRawObservationBatchTokens: input.checkpointedOmRawObservationBatchTokens,
          checkpointedOmObservationReflectionBatchTokens:
            input.checkpointedOmObservationReflectionBatchTokens,
          checkpointedOmObservationSupportTokens: input.checkpointedOmObservationSupportTokens,
          checkpointedOmReflectionSupportTokens: input.checkpointedOmReflectionSupportTokens,
          ltmRecallSearchMode: input.ltmRecallSearchMode,
          ltmRecallGraphTopK: input.ltmRecallGraphTopK,
          ltmRecallGraphThreshold: input.ltmRecallGraphThreshold,
          ltmRecallGraphRandomWalkSteps: input.ltmRecallGraphRandomWalkSteps,
          ltmRecallGraphIncludeSources: input.ltmRecallGraphIncludeSources ? 1 : 0,
          ltmRecallScoreThreshold: input.ltmRecallScoreThreshold,
          ltmRecallDocumentCount: input.ltmRecallDocumentCount,
          updatedAt: now,
        },
      });

    return {
      companyName: input.companyName,
      companyContext: input.companyContext,
      stepDelayEnabled: input.stepDelayEnabled,
      communicationDmFlushingEnabled: input.communicationDmFlushingEnabled,
      communicationGroupFlushingEnabled: input.communicationGroupFlushingEnabled,
      memoryLastMessagesFullEnabled: input.memoryLastMessagesFullEnabled,
      memoryLastMessagesCount: input.memoryLastMessagesCount,
      tokenCountFilterEnabled: input.tokenCountFilterEnabled,
      tokenCountFilterLimit: input.tokenCountFilterLimit,
      checkpointedOmEnabled: input.checkpointedOmEnabled,
      checkpointedOmTotalContextTokens: input.checkpointedOmTotalContextTokens,
      checkpointedOmRecentRawTokens: input.checkpointedOmRecentRawTokens,
      checkpointedOmRawObservationBatchTokens: input.checkpointedOmRawObservationBatchTokens,
      checkpointedOmObservationReflectionBatchTokens:
        input.checkpointedOmObservationReflectionBatchTokens,
      checkpointedOmObservationSupportTokens: input.checkpointedOmObservationSupportTokens,
      checkpointedOmReflectionSupportTokens: input.checkpointedOmReflectionSupportTokens,
      ltmRecallSearchMode: input.ltmRecallSearchMode,
      ltmRecallGraphTopK: input.ltmRecallGraphTopK,
      ltmRecallGraphThreshold: input.ltmRecallGraphThreshold,
      ltmRecallGraphRandomWalkSteps: input.ltmRecallGraphRandomWalkSteps,
      ltmRecallGraphIncludeSources: input.ltmRecallGraphIncludeSources,
      ltmRecallScoreThreshold: input.ltmRecallScoreThreshold,
      ltmRecallDocumentCount: input.ltmRecallDocumentCount,
      updatedAt: now,
    } satisfies SystemSettingsValue;
  }

  return {
    getSettings,
    upsertSettings,
  };
}
