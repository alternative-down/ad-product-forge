import { eq } from 'drizzle-orm';
import { errorMsg } from '../agents/error-formatting';
import { forgeDebug } from '@forge-runtime/core';
import { withDbErrorLogging } from '../database/error-logging';

import type { Database } from '../database/client';
import { systemSettings } from '../database/schema';

const SYSTEM_SETTINGS_ID = 'global';

// ── Defaults ───────────────────────────────────────────────────────────────

const DEFAULTS = {
  companyName: '',
  companyContext: '',
  stepDelayEnabled: true,
  communicationDmFlushingEnabled: true,
  communicationGroupFlushingEnabled: true,
  memoryLastMessagesFullEnabled: false,
  memoryLastMessagesCount: 20,
  tokenCountFilterEnabled: true,
  tokenCountFilterLimit: 100_000,
  checkpointedOmEnabled: false,
  checkpointedOmTotalContextTokens: 50_000,
  checkpointedOmRecentRawTokens: 10_000,
  checkpointedOmRawObservationBatchTokens: 5_000,
  checkpointedOmObservationReflectionBatchTokens: 5_000,
  checkpointedOmObservationSupportTokens: 2_000,
  checkpointedOmReflectionSupportTokens: 2_000,
  ltmRecallSearchMode: 'hybrid' as const,
  ltmRecallWorkspaceTopK: 3,
  ltmRecallGraphTopK: 3,
  ltmRecallGraphThreshold: 0.7,
  ltmRecallGraphRandomWalkSteps: 50,
  ltmRecallGraphIncludeSources: true,
  ltmRecallScoreThreshold: 0.7,
  ltmRecallDocumentCount: 3,
};

// ── Types ───────────────────────────────────────────────────────────────────

type SystemSettingsInput = typeof DEFAULTS;

export type SystemSettingsValue = SystemSettingsInput & { updatedAt: number | null; createdAt: number | null };

// ── Mapping helpers ──────────────────────────────────────────────────────────

/** Converts 0/1 integer columns to booleans. */
function toBool(value: number | null | undefined): boolean {
  return value === 1;
}

/** Normalises the LTM recall search mode. */
function resolveRecallSearchMode(
  value: string | null | undefined,
): typeof DEFAULTS.ltmRecallSearchMode {
  if (value === 'vector' || value === 'graph' || value === 'bm25')
    return value as typeof DEFAULTS.ltmRecallSearchMode;
  return 'hybrid';
}

/**
 * Maps a raw database row to a SystemSettingsValue, applying defaults for
 * every field. Boolean columns (stored as 0/1 integers) are normalised to
 * booleans.
 */
function mapRow(row: any | null): SystemSettingsValue {
  if (row === null) {
    return { ...DEFAULTS, updatedAt: null, createdAt: null };
  }

  return {
    companyName: row.companyName,
    companyContext: row.companyContext,
    stepDelayEnabled: toBool(row.stepDelayEnabled),
    communicationDmFlushingEnabled: toBool(row.communicationDmFlushingEnabled),
    communicationGroupFlushingEnabled: toBool(row.communicationGroupFlushingEnabled),
    memoryLastMessagesFullEnabled: toBool(row.memoryLastMessagesFullEnabled),
    memoryLastMessagesCount: row.memoryLastMessagesCount,
    tokenCountFilterEnabled: toBool(row.tokenCountFilterEnabled),
    tokenCountFilterLimit: row.tokenCountFilterLimit,
    checkpointedOmEnabled: toBool(row.checkpointedOmEnabled),
    checkpointedOmTotalContextTokens: row.checkpointedOmTotalContextTokens,
    checkpointedOmRecentRawTokens: row.checkpointedOmRecentRawTokens,
    checkpointedOmRawObservationBatchTokens: row.checkpointedOmRawObservationBatchTokens,
    checkpointedOmObservationReflectionBatchTokens:
      row.checkpointedOmObservationReflectionBatchTokens,
    checkpointedOmObservationSupportTokens: row.checkpointedOmObservationSupportTokens,
    checkpointedOmReflectionSupportTokens: row.checkpointedOmReflectionSupportTokens,
    ltmRecallSearchMode: resolveRecallSearchMode(row.ltmRecallSearchMode),
    ltmRecallWorkspaceTopK: row.ltmRecallWorkspaceTopK,
    ltmRecallGraphTopK: row.ltmRecallGraphTopK,
    ltmRecallGraphThreshold: row.ltmRecallGraphThreshold,
    ltmRecallGraphRandomWalkSteps: row.ltmRecallGraphRandomWalkSteps,
    ltmRecallGraphIncludeSources: toBool(row.ltmRecallGraphIncludeSources),
    ltmRecallScoreThreshold: row.ltmRecallScoreThreshold,
    ltmRecallDocumentCount: row.ltmRecallDocumentCount,
    updatedAt: row.updatedAt ?? null,
    createdAt: row.createdAt ?? null,
  };
}

// ── Store ───────────────────────────────────────────────────────────────────

export type SystemSettingsStore = Awaited<ReturnType<typeof createSystemSettingsStore>>;
export function createSystemSettingsStore(db: Database) {
  async function getSettings(): Promise<SystemSettingsValue> {
    // #6028 (L#NN-50 #19 v3): distinguish 'settings not initialized' (row=null,
    // handled by mapRow → DEFAULTS) from 'DB query failed' (error → throw).
    // Previously the silent failure returned DEFAULTS on both, hiding real
    // failures. Now the DB error propagates via withDbErrorLogging (default
    // mode='throw') and is logged in the unified Format A.
    const row = await withDbErrorLogging({
      scope: 'system-settings',
      op: 'getSettings',
      verb: 'read',
      fn: () =>
        db.query.systemSettings.findFirst({
          where: eq(systemSettings.id, SYSTEM_SETTINGS_ID),
        }),
    });
    return mapRow(row);
  }

  async function upsertSettings(input: SystemSettingsInput): Promise<SystemSettingsValue> {
    const now = Date.now();
    const row = {
      id: SYSTEM_SETTINGS_ID,
      createdAt: now,
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
      ltmRecallWorkspaceTopK: input.ltmRecallWorkspaceTopK,
      ltmRecallGraphTopK: input.ltmRecallGraphTopK,
      ltmRecallGraphThreshold: input.ltmRecallGraphThreshold,
      ltmRecallGraphRandomWalkSteps: input.ltmRecallGraphRandomWalkSteps,
      ltmRecallGraphIncludeSources: input.ltmRecallGraphIncludeSources ? 1 : 0,
      ltmRecallScoreThreshold: input.ltmRecallScoreThreshold,
      ltmRecallDocumentCount: input.ltmRecallDocumentCount,
      updatedAt: now,
    };

    // Atomic upsert (race-free, see #5502). Excludes id (the conflict
    // target) and createdAt (preserved on update per #5526) from the SET clause.
    const { id: _id, createdAt: _createdAt, ...updateSet } = row;

    return await withDbErrorLogging({
      scope: 'system-settings',
      op: 'upsertSettings',
      verb: 'write',
      fn: async () => {
        await db
          .insert(systemSettings)
          .values(row)
          .onConflictDoUpdate({
            target: systemSettings.id,
            set: updateSet,
          });
        return { ...input, updatedAt: now, createdAt: now };
      },
    });
  }

  return { getSettings, upsertSettings };
}
