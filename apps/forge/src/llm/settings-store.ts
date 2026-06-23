import { errorMsg } from '../agents/error-formatting';
import { createId } from '../utils/id';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import type { Database } from '../database/client';
import {
  llmProfiles,
  systemLlmDefaults,
  type LlmProfile,
} from '../database/schema';
import { decryptSecret, encryptSecret } from '../encryption/crypto';
import { forgeDebug } from '@forge-runtime/core';
import { withDbErrorLogging } from '../database/error-logging';

const llmProfileSchema = z.object({
  name: z.string().trim().min(1),
  modelKey: z.string().min(1),
  baseUrl: z.string().url().optional().nullable(),
  apiKey: z.string().trim().min(1),
  contractCostMultiplier: z.number().positive().default(1),
  isEnabled: z.boolean().default(true),
});

const llmDefaultsSchema = z
  .object({
    primaryProfileId: z.string().min(1),
    omProfileId: z.string().min(1),
    hiringRhProfileId: z.string().min(1),
  })
  .refine(
    (data) =>
      data.primaryProfileId !== data.omProfileId &&
      data.omProfileId !== data.hiringRhProfileId &&
      data.primaryProfileId !== data.hiringRhProfileId,
    { message: 'All three default profile IDs must be distinct' },
  );

const DEFAULTS_ROW_ID = 'default';

export type LlmSettingsStore = Awaited<ReturnType<typeof createLlmSettingsStore>>;
// Note: resolveProfileRuntimeModel accepts this via 'as RuntimeProfile' cast in agent-loader-data.ts
export type LlmProfileRecord = {
  profileId: string;
  name: string;
  modelKey: string;
  baseUrl: string | null;
  apiKey: string; // decrypted by toProfileRecord
  contractCostMultiplier?: number;
  isEnabled: boolean;
};

// Closes #5967: list* MUST NOT decrypt credentials. This metadata-only
// projection is the safe API for callers that only need identity/enabled state.
export type LlmProfileMetadata = Omit<LlmProfileRecord, 'apiKey'>;

export function createLlmSettingsStore(db: Database) {
  // DEPRECATED for callers that do not need plaintext apiKey.
  // Use listProfileMetadata() to enumerate, getProfile(id) for single fetch.
  // Retained for backward compatibility with admin UIs that legitimately
  // surface credentials (e.g., "show API key" button under explicit user action).
  async function listProfiles() {
    return await withDbErrorLogging({
      scope: 'llm',
      op: 'listProfiles',
      verb: 'read',
      context: {},
      fn: async () => {
        const rows = await db.query.llmProfiles.findMany({
          orderBy: (fields, { asc }) => [asc(fields.modelKey)],
        });
        return rows.map(toProfileRecord);
      },
    });
  }

  // Closes #5967: returns metadata only, no decryption.
  async function listProfileMetadata(): Promise<LlmProfileMetadata[]> {
    return await withDbErrorLogging({
      scope: 'llm',
      op: 'listProfileMetadata',
      verb: 'read',
      context: {},
      fn: async () => {
        const rows = await db.query.llmProfiles.findMany({
          orderBy: (fields, { asc }) => [asc(fields.modelKey)],
        });
        return rows.map(toProfileMetadata);
      },
    });
  }

  async function getDefaults() {
    const row = await getDefaultsRow();

    if (!row) {
      return null;
    }

    return {
      primaryProfileId: row.primaryProfileId,
      omProfileId: row.omProfileId,
      hiringRhProfileId: row.hiringRhProfileId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  // Closes #5967: fetch only the 3 needed profiles via getProfile (decrypts 3,
  // not N). Previously this called listProfiles which decrypted ALL.
  async function getResolvedDefaults(): Promise<{ primaryProfile: LlmProfileRecord; omProfile: LlmProfileRecord; hiringRhProfile: LlmProfileRecord; }> {
    const defaults = await getDefaults();

    if (defaults === null || defaults === undefined) {
      forgeDebug({
        scope: 'llm-settings',
        level: 'warn',
        message: 'System LLM defaults not configured',
      });
      throw new Error('System LLM defaults are not configured');
    }

    const [primaryProfile, omProfile, hiringRhProfile] = await Promise.all([
      getProfile(defaults.primaryProfileId),
      getProfile(defaults.omProfileId),
      getProfile(defaults.hiringRhProfileId),
    ]);

    if (primaryProfile.isEnabled !== true) {
      forgeDebug({
        scope: 'llm-settings',
        level: 'warn',
        message: 'Default primary LLM profile missing or disabled',
      });
      throw new Error('Default primary LLM profile is missing or disabled');
    }

    if (omProfile.isEnabled !== true) {
      forgeDebug({
        scope: 'llm-settings',
        level: 'warn',
        message: 'Default OM LLM profile missing or disabled',
      });
      throw new Error('Default OM LLM profile is missing or disabled');
    }

    if (hiringRhProfile.isEnabled !== true) {
      forgeDebug({
        scope: 'llm-settings',
        level: 'warn',
        message: 'Default hiring RH LLM profile missing or disabled',
      });
      throw new Error('Default hiring RH LLM profile is missing or disabled');
    }

    return {
      primaryProfile,
      omProfile,
      hiringRhProfile,
    };
  }

  async function getProfile(profileId: string) {
    const row = await db.query.llmProfiles.findFirst({
      where: eq(llmProfiles.id, profileId),
    });

    if (!row) {
      forgeDebug({
        scope: 'llm-settings',
        level: 'warn',
        message: 'LLM profile not found',
        context: { profileId },
      });
      throw new Error(`LLM profile not found: ${profileId}`);
    }

    return toProfileRecord(row);
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
    await withDbErrorLogging({
      scope: 'llm',
      op: 'upsertProfile',
      verb: 'write',
      context: { profileId },
      fn: async () => {
        await db
          .insert(llmProfiles)
          .values({
            id: profileId,
            name: parsed.name.trim(),
            modelKey: parsed.modelKey,
            baseUrl: parsed.baseUrl?.trim() ?? null,
            encryptedApiKey: encryptSecret(parsed.apiKey.trim()),
            contractCostMultiplier: parsed.contractCostMultiplier,
            isEnabled: parsed.isEnabled ? 1 : 0,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: llmProfiles.id,
            set: {
              name: parsed.name.trim(),
              modelKey: parsed.modelKey,
              baseUrl: parsed.baseUrl?.trim() ?? null,
              encryptedApiKey: encryptSecret(parsed.apiKey.trim()),
              contractCostMultiplier: parsed.contractCostMultiplier,
              isEnabled: parsed.isEnabled ? 1 : 0,
              updatedAt: now,
            },
          });
      },
    });

    return {
      profileId,
      name: parsed.name.trim(),
      modelKey: parsed.modelKey,
      baseUrl: parsed.baseUrl?.trim() ?? null,
      apiKey: parsed.apiKey.trim(),
      contractCostMultiplier: parsed.contractCostMultiplier,
      isEnabled: parsed.isEnabled,
    };
  }

  async function deleteProfile(profileId: string) {
    await withDbErrorLogging({
      scope: 'llm',
      op: 'deleteProfile',
      verb: 'write',
      context: { profileId },
      fn: async () => {
        await db.transaction(async (tx) => {
          const defaults = await tx.query.systemLlmDefaults.findFirst({
            where: eq(systemLlmDefaults.id, DEFAULTS_ROW_ID),
          });

          if (
            defaults &&
            (defaults.primaryProfileId === profileId ||
              defaults.omProfileId === profileId ||
              defaults.hiringRhProfileId === profileId)
          ) {
            forgeDebug({
              scope: 'llm-settings',
              level: 'warn',
              message: 'deleteModelProfile: cannot delete selected system default',
              context: { profileId },
            });
            throw new Error(
              'Cannot delete an LLM profile that is currently selected as a system default',
            );
          }

          await tx.delete(llmProfiles).where(eq(llmProfiles.id, profileId));
        });
      },
    });
  }

  // Closes #5967: use listProfileMetadata (no decryption) for existence/enabled checks.
  async function updateDefaults(input: {
    primaryProfileId: string;
    omProfileId: string;
    hiringRhProfileId: string;
  }) {
    const parsed = llmDefaultsSchema.parse(input);
    const profiles = await listProfileMetadata();
    const profileMap = new Map(profiles.map((profile: LlmProfileMetadata) => [profile.profileId, profile]));

    for (const profileId of [
      parsed.primaryProfileId,
      parsed.omProfileId,
      parsed.hiringRhProfileId,
    ]) {
      const profile = profileMap.get(profileId);

      if (profile === null || profile === undefined) {
        forgeDebug({
          scope: 'llm-settings',
          level: 'warn',
          message: 'LLM profile not found',
          context: { profileId },
        });
        throw new Error(`LLM profile not found: ${profileId}`);
      }

      if (profile.isEnabled !== true) {
        throw new Error(`Default LLM profile must be enabled: ${profile.profileId}`);
      }
    }

    const now = Date.now();
    await withDbErrorLogging({
      scope: 'llm',
      op: 'updateDefaults',
      verb: 'write',
      context: {},
      fn: async () => {
        await db
          .insert(systemLlmDefaults)
          .values({
            id: DEFAULTS_ROW_ID,
            primaryProfileId: parsed.primaryProfileId,
            omProfileId: parsed.omProfileId,
            hiringRhProfileId: parsed.hiringRhProfileId,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: systemLlmDefaults.id,
            set: {
              primaryProfileId: parsed.primaryProfileId,
              omProfileId: parsed.omProfileId,
              hiringRhProfileId: parsed.hiringRhProfileId,
              updatedAt: now,
            },
          });
      },
    });
    return parsed;
  }

  async function getDefaultsRow() {
    return await withDbErrorLogging({
      scope: 'llm',
      op: 'getDefaultsRow',
      verb: 'read',
      context: {},
      fn: async () => {
        return await db.query.systemLlmDefaults.findFirst({
          where: eq(systemLlmDefaults.id, DEFAULTS_ROW_ID),
        });
      },
    });
  }

  return {
    listProfiles,
    listProfileMetadata,
    getProfile,
    getDefaults,
    getResolvedDefaults,
    upsertProfile,
    deleteProfile,
    updateDefaults,
  };
}

function toProfileMetadata(row: LlmProfile): LlmProfileMetadata {
  // Closes #5967 + L#NN-50 #17 N=4: read row fields directly. This avoids
  // both the destructure pattern (which requires an unused-var workaround
  // for encryptedApiKey) and the underscore-prefix hack. Cleanest solution
  // per Veritas QA r4 review_id 4553006809.
  return {
    profileId: row.id,
    name: row.name ?? '',
    modelKey: row.modelKey,
    baseUrl: row.baseUrl ?? null,
    contractCostMultiplier: row.contractCostMultiplier,
    isEnabled: row.isEnabled === 1,
  };
}

function toProfileRecord(row: LlmProfile): LlmProfileRecord {
  const { id, encryptedApiKey, isEnabled, ...rest } = row;

  let apiKey: string;
  try {
    apiKey = decryptSecret(encryptedApiKey);
  } catch (err) {
    forgeDebug({
      scope: 'llm-settings',
      level: 'error',
      message: 'Failed to decrypt LLM profile API key',
      context: { profileId: id, error: errorMsg(err) },
    });
    throw new Error(`Failed to decrypt LLM profile ${id}: ${errorMsg(err)}`);
  }

  return {
    profileId: id,
    name: rest.name ?? '',
    modelKey: row.modelKey,
    baseUrl: rest.baseUrl ?? null,
    apiKey,
    contractCostMultiplier: rest.contractCostMultiplier,
    isEnabled: isEnabled === 1,
  };
}
