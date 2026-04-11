import { eq } from 'drizzle-orm';

import type { Database } from '../database';
import { systemSettings } from '../database/schema';

const SYSTEM_SETTINGS_ID = 'global';

export function createSystemSettingsStore(db: Database) {
  async function getSettings() {
    const row = await db.query.systemSettings.findFirst({
      where: eq(systemSettings.id, SYSTEM_SETTINGS_ID),
    });

    return {
      companyName: row?.companyName ?? '',
      companyContext: row?.companyContext ?? '',
      stepDelayEnabled: row ? row.stepDelayEnabled === 1 : true,
      communicationDmFlushingEnabled: row ? row.communicationDmFlushingEnabled === 1 : true,
      communicationGroupFlushingEnabled: row ? row.communicationGroupFlushingEnabled === 1 : true,
      memoryLastMessagesFullEnabled: row ? row.memoryLastMessagesFullEnabled === 1 : false,
      memoryLastMessagesCount: row?.memoryLastMessagesCount ?? 20,
      tokenCountFilterEnabled: row ? row.tokenCountFilterEnabled === 1 : true,
      tokenCountFilterLimit: row?.tokenCountFilterLimit ?? 100000,
      omObservationMessageTokens: row?.omObservationMessageTokens ?? 15000,
      omObservationBufferTokens: row?.omObservationBufferTokens ?? 0.2,
      omObservationBufferActivation: row?.omObservationBufferActivation ?? 0.8,
      omObservationPreviousObserverTokens: row?.omObservationPreviousObserverTokens ?? 1000,
      omReflectionObservationTokens: row?.omReflectionObservationTokens ?? 20000,
      omReflectionBufferActivation: row?.omReflectionBufferActivation ?? 0.5,
      updatedAt: row?.updatedAt ?? null,
    };
  }

  async function upsertSettings(input: {
    companyName: string;
    companyContext: string;
    stepDelayEnabled: boolean;
    communicationDmFlushingEnabled: boolean;
    communicationGroupFlushingEnabled: boolean;
    memoryLastMessagesFullEnabled: boolean;
    memoryLastMessagesCount: number;
    tokenCountFilterEnabled: boolean;
    tokenCountFilterLimit: number;
    omObservationMessageTokens: number;
    omObservationBufferTokens: number;
    omObservationBufferActivation: number;
    omObservationPreviousObserverTokens: number;
    omReflectionObservationTokens: number;
    omReflectionBufferActivation: number;
  }) {
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
        omObservationMessageTokens: input.omObservationMessageTokens,
        omObservationBufferTokens: input.omObservationBufferTokens,
        omObservationBufferActivation: input.omObservationBufferActivation,
        omObservationPreviousObserverTokens: input.omObservationPreviousObserverTokens,
        omReflectionObservationTokens: input.omReflectionObservationTokens,
        omReflectionBufferActivation: input.omReflectionBufferActivation,
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
          omObservationMessageTokens: input.omObservationMessageTokens,
          omObservationBufferTokens: input.omObservationBufferTokens,
          omObservationBufferActivation: input.omObservationBufferActivation,
          omObservationPreviousObserverTokens: input.omObservationPreviousObserverTokens,
          omReflectionObservationTokens: input.omReflectionObservationTokens,
          omReflectionBufferActivation: input.omReflectionBufferActivation,
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
      omObservationMessageTokens: input.omObservationMessageTokens,
      omObservationBufferTokens: input.omObservationBufferTokens,
      omObservationBufferActivation: input.omObservationBufferActivation,
      omObservationPreviousObserverTokens: input.omObservationPreviousObserverTokens,
      omReflectionObservationTokens: input.omReflectionObservationTokens,
      omReflectionBufferActivation: input.omReflectionBufferActivation,
      updatedAt: now,
    };
  }

  return {
    getSettings,
    upsertSettings,
  };
}
