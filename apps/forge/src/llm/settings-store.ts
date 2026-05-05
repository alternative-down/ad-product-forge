import { createId } from '../utils/id';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import type { Database } from '../database/index';
import { llmProfiles, systemLlmDefaults, type LlmProfile } from '../database/schema';
import { decryptSecret, encryptSecret } from '../encryption/crypto';
import { forgeDebug } from '@forge-runtime/core';

const llmProfileSchema = z.object({
  name: z.string().min(1),
  modelKey: z.string().min(1),
  baseUrl: z.string().url().optional().nullable(),
  apiKey: z.string().min(1),
  contractCostMultiplier: z.number().positive().default(1),
  isEnabled: z.boolean().default(true),
});

const llmDefaultsSchema = z.object({
  primaryProfileId: z.string().min(1),
  omProfileId: z.string().min(1),
  hiringRhProfileId: z.string().min(1),
});

const DEFAULTS_ROW_ID = 'default';

export function createLlmSettingsStore(db: Database) {
  async function listProfiles() {
    try {
      const rows = await db.query.llmProfiles.findMany({
        orderBy: (fields, { asc }) => [asc(fields.modelKey)],
      });
      return rows.map(toProfileRecord);
    } catch (err) {
      forgeDebug('llm', 'Failed to list LLM profiles', { error: err });
      throw err;
    }
  }

  async function getDefaults() {
    try {
      const row = await getDefaultsRow();
      if (!row) return null;
      return {
        primaryProfileId: row.primaryProfileId,
        omProfileId: row.omProfileId,
        hiringRhProfileId: row.hiringRhProfileId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    } catch (err) {
      forgeDebug('llm', 'Failed to get LLM defaults', { error: err });
      throw err;
    }
  }

  async function getResolvedDefaults() {
    const [profiles, defaults] = await Promise.all([listProfiles(), getDefaults()]);

    if (!defaults) {
      throw new Error('System LLM defaults are not configured');
    }

    const profileMap = new Map(profiles.map((profile) => [profile.profileId, profile]));
    const primaryProfile = profileMap.get(defaults.primaryProfileId);
    const omProfile = profileMap.get(defaults.omProfileId);
    const hiringRhProfile = profileMap.get(defaults.hiringRhProfileId);

    if (!primaryProfile || !primaryProfile.isEnabled) {
      throw new Error('Default primary LLM profile is missing or disabled');
    }

    if (!omProfile || !omProfile.isEnabled) {
      throw new Error('Default OM LLM profile is missing or disabled');
    }

    if (!hiringRhProfile || !hiringRhProfile.isEnabled) {
      throw new Error('Default hiring RH LLM profile is missing or disabled');
    }

    return {
      primaryProfile,
      omProfile,
      hiringRhProfile,
    };
  }

  async function getProfile(profileId: string) {
    try {
      const row = await db.query.llmProfiles.findFirst({
        where: eq(llmProfiles.id, profileId),
      });

      if (!row) {
        throw new Error(`LLM profile not found: ${profileId}`);
      }

      return toProfileRecord(row);
    } catch (err) {
      forgeDebug('llm', 'Failed to get LLM profile', { profileId, error: err });
      throw err;
    }
  }

  async function upsertProfile(input: {
    profileId?: string;
    name: string;
    modelKey: string;
    baseUrl?: string | null;
    apiKey: string;
    contractCostMultiplier?: number;
    isEnabled?: boolean;
  }) {
    const parsed = llmProfileSchema.parse(input);
    const now = Date.now();
    const profileId = input.profileId ?? createId();
    let existing: typeof llmProfiles.$inferSelect | null = null;

    try {
      existing = input.profileId
        ? await db.query.llmProfiles.findFirst({
            where: eq(llmProfiles.id, input.profileId),
          })
        : null;
    } catch (err) {
      forgeDebug('llm', 'Failed to query LLM profile', { profileId, error: err });
      throw err;
    }

    if (existing) {
      try {
        await db
          .update(llmProfiles)
          .set({
            name: parsed.name.trim(),
            modelKey: parsed.modelKey,
            baseUrl: parsed.baseUrl?.trim() ?? null,
            encryptedApiKey: encryptSecret(parsed.apiKey.trim()),
            contractCostMultiplier: parsed.contractCostMultiplier,
            isEnabled: parsed.isEnabled ? 1 : 0,
            updatedAt: now,
          })
          .where(eq(llmProfiles.id, profileId));
      } catch (err) {
        forgeDebug('llm', 'Failed to update LLM profile', { profileId, error: err });
        throw err;
      }
    } else {
      try {
        await db.insert(llmProfiles).values({
          id: profileId,
          name: parsed.name.trim(),
          modelKey: parsed.modelKey,
          baseUrl: parsed.baseUrl?.trim() ?? null,
          encryptedApiKey: encryptSecret(parsed.apiKey.trim()),
          contractCostMultiplier: parsed.contractCostMultiplier,
          isEnabled: parsed.isEnabled ? 1 : 0,
          createdAt: now,
          updatedAt: now,
        });
      } catch (err) {
        forgeDebug('llm', 'Failed to insert LLM profile', { profileId, error: err });
        throw err;
      }
    }

    return {
      profileId,
      name: parsed.name.trim(),
      modelKey: parsed.modelKey,
      baseUrl: parsed.baseUrl?.trim() ?? null,
      apiKey: null,
      contractCostMultiplier: parsed.contractCostMultiplier,
      isEnabled: parsed.isEnabled,
    };
  }

  async function deleteProfile(profileId: string) {
    try {
      await db.delete(llmProfiles).where(eq(llmProfiles.id, profileId));
    } catch (err) {
      forgeDebug('llm', 'Failed to delete LLM profile', { profileId, error: err });
      throw err;
    }
  }

  async function updateDefaults(input: {
    primaryProfileId: string;
    omProfileId: string;
    hiringRhProfileId: string;
  }) {
    const parsed = llmDefaultsSchema.parse(input);
    const profiles = await listProfiles();
    const profileMap = new Map(profiles.map((profile) => [profile.profileId, profile]));

    for (const profileId of [parsed.primaryProfileId, parsed.omProfileId, parsed.hiringRhProfileId]) {
      const profile = profileMap.get(profileId);

      if (!profile) {
        throw new Error(`LLM profile not found: ${profileId}`);
      }

      if (!profile.isEnabled) {
        throw new Error(`Default LLM profile must be enabled: ${profile.profileId}`);
      }
    }

    const now = Date.now();
    let existing: typeof systemLlmDefaults.$inferSelect | null = null;

    try {
      existing = await getDefaultsRow();
    } catch (err) {
      forgeDebug('llm', 'Failed to query LLM defaults', { error: err });
      throw err;
    }

    if (existing) {
      try {
        await db
          .update(systemLlmDefaults)
          .set({
            primaryProfileId: parsed.primaryProfileId,
            omProfileId: parsed.omProfileId,
            hiringRhProfileId: parsed.hiringRhProfileId,
            updatedAt: now,
          })
          .where(eq(systemLlmDefaults.id, DEFAULTS_ROW_ID));
      } catch (err) {
        forgeDebug('llm', 'Failed to update LLM defaults', { error: err });
        throw err;
      }
    } else {
      try {
        await db.insert(systemLlmDefaults).values({
          id: DEFAULTS_ROW_ID,
          primaryProfileId: parsed.primaryProfileId,
          omProfileId: parsed.omProfileId,
          hiringRhProfileId: parsed.hiringRhProfileId,
          createdAt: now,
          updatedAt: now,
        });
      } catch (err) {
        forgeDebug('llm', 'Failed to insert LLM defaults', { error: err });
        throw err;
      }
    }

    return parsed;
  }

  async function getDefaultsRow() {
    try {
      return await db.query.systemLlmDefaults.findFirst({
        where: eq(systemLlmDefaults.id, DEFAULTS_ROW_ID),
      });
    } catch (err) {
      forgeDebug('llm', 'Failed to get LLM defaults row', { error: err });
      throw err;
    }
  }

  return {
    listProfiles,
    getProfile,
    getDefaults,
    getResolvedDefaults,
    upsertProfile,
    deleteProfile,
    updateDefaults,
  };
}

function toProfileRecord(row: LlmProfile) {
  const {
    id,
    encryptedApiKey,
    isEnabled,
    ...rest
  } = row;

  return {
    ...rest,
    profileId: id,
    baseUrl: rest.baseUrl ?? null,
    apiKey: null,
    isEnabled: isEnabled === 1,
  };
}