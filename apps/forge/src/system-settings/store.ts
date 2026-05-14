import { eq } from 'drizzle-orm';
import { forgeDebug } from '@forge-runtime/core';

import type { Database } from '../database/schema';
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

export type SystemSettingsValue = SystemSettingsInput & { updatedAt: number | null };

// ── Mapping helpers ──────────────────────────────────────────────────────────

/** Converts 0/1 integer columns to booleans. */
function toBool(value: number | null | undefined): boolean {
  return value === 1;
}

/** Normalises the LTM recall search mode. */
function resolveRecallSearchMode(value: string | null | undefined): typeof DEFAULTS.ltmRecallSearchMode {
  if (value === 'vector' || value === 'bm25') return value;
  return 'hybrid';
}

/**
 * Maps a raw database row to a SystemSettingsValue, applying defaults for
 * every field. Boolean columns (stored as 0/1 integers) are normalised to
 * booleans.
 */
function mapRow(row: SystemSettings | null): SystemSettingsValue {
  if (row === null) {
    return { ...DEFAULTS, updatedAt: null };
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
    checkpointedOmObservationReflectionBatchTokens: row.checkpointedOmObservationReflectionBatchTokens,
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
  };
}

// ── Store ───────────────────────────────────────────────────────────────────

export function createSystemSettingsStore(db: Database) {
  async function getSettings(): Promise<SystemSettingsValue> {
    const row = await db.query.systemSettings.findFirst({
      where: eq(systemSettings.id, SYSTEM_SETTINGS_ID),
    });
    return mapRow(row);
    } catch (err) {
    forgeDebug({ scope: 'system-settings', level: 'error', message: '[system-settings] getSettings failed', context: { error: err instanceof Error ? err.message : String(err) } });
    throw err;
  }

  return { getSettings, upsertSettings };
}