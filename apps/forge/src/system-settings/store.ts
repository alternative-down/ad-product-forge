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
      updatedAt: row?.updatedAt ?? null,
    };
  }

  async function upsertSettings(input: {
    companyName: string;
    companyContext: string;
    stepDelayEnabled: boolean;
  }) {
    const now = Date.now();

    await db
      .insert(systemSettings)
      .values({
        id: SYSTEM_SETTINGS_ID,
        companyName: input.companyName,
        companyContext: input.companyContext,
        stepDelayEnabled: input.stepDelayEnabled ? 1 : 0,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: systemSettings.id,
        set: {
          companyName: input.companyName,
          companyContext: input.companyContext,
          stepDelayEnabled: input.stepDelayEnabled ? 1 : 0,
          updatedAt: now,
        },
      });

    return {
      companyName: input.companyName,
      companyContext: input.companyContext,
      stepDelayEnabled: input.stepDelayEnabled,
      updatedAt: now,
    };
  }

  return {
    getSettings,
    upsertSettings,
  };
}
