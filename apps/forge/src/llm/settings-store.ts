import { createId } from '@paralleldrive/cuid2';
import {
  CLAUDE_MAX_MODELS,
  MINIMAX_MODELS,
  OPENAI_CODEX_MODELS,
  claudeMaxProvider,
  openaiCodexProvider,
} from '@mastra-engine/core';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import type { Database } from '../database/index';
import type { LlmProviderType } from '../database/schema';
import { llmProfiles, systemLlmDefaults } from '../database/schema';
import { decryptSecret, encryptSecret } from '../encryption/crypto';

const llmProfileSchema = z.object({
  slug: z.string().min(1),
  label: z.string().min(1),
  providerType: z.enum(['openai-codex', 'claude-max', 'minimax']),
  modelId: z.string().min(1),
  apiKey: z.string().min(1).optional().nullable(),
  contractCostMultiplier: z.number().positive().default(1),
  isEnabled: z.boolean().default(true),
});

const llmDefaultsSchema = z.object({
  primaryProfileId: z.string().min(1),
  omProfileId: z.string().min(1),
  hiringRhProfileId: z.string().min(1),
});

const SUPPORTED_MODELS = {
  'openai-codex': [...OPENAI_CODEX_MODELS],
  'claude-max': [...CLAUDE_MAX_MODELS],
  minimax: [...MINIMAX_MODELS],
} as const satisfies Record<LlmProviderType, readonly string[]>;

const DEFAULTS_ROW_ID = 'default';

export function createLlmSettingsStore(db: Database) {
  async function listProfiles() {
    const rows = await db.query.llmProfiles.findMany({
      orderBy: (fields, { asc }) => [asc(fields.label)],
    });

    return rows.map((row) => ({
      profileId: row.id,
      slug: row.slug,
      label: row.label,
      providerType: row.providerType,
      modelId: row.modelId,
      modelKey: buildPricingModelKey(row.providerType, row.modelId),
      runtimeModelKey: buildRuntimeModelKey({
        providerType: row.providerType,
        modelId: row.modelId,
        hasApiKey: Boolean(row.encryptedApiKey),
      }),
      apiKey: row.encryptedApiKey ? decryptSecret(row.encryptedApiKey) : null,
      hasApiKey: Boolean(row.encryptedApiKey),
      contractCostMultiplier: row.contractCostMultiplier,
      isEnabled: row.isEnabled === 1,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  async function getDefaults() {
    const row = await getDefaultsRow();

    if (!row) {
      throw new Error('System LLM defaults are not configured');
    }

    return {
      primaryProfileId: row.primaryProfileId,
      omProfileId: row.omProfileId,
      hiringRhProfileId: row.hiringRhProfileId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async function getResolvedDefaults() {
    const [profiles, defaults] = await Promise.all([listProfiles(), getDefaults()]);
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
    const row = await db.query.llmProfiles.findFirst({
      where: eq(llmProfiles.id, profileId),
    });

    if (!row) {
      throw new Error(`LLM profile not found: ${profileId}`);
    }

    return {
      profileId: row.id,
      slug: row.slug,
      label: row.label,
      providerType: row.providerType,
      modelId: row.modelId,
      modelKey: buildPricingModelKey(row.providerType, row.modelId),
      runtimeModelKey: buildRuntimeModelKey({
        providerType: row.providerType,
        modelId: row.modelId,
        hasApiKey: Boolean(row.encryptedApiKey),
      }),
      apiKey: row.encryptedApiKey ? decryptSecret(row.encryptedApiKey) : null,
      hasApiKey: Boolean(row.encryptedApiKey),
      contractCostMultiplier: row.contractCostMultiplier,
      isEnabled: row.isEnabled === 1,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async function upsertProfile(input: {
    profileId?: string;
    slug: string;
    label: string;
    providerType: LlmProviderType;
    modelId: string;
    apiKey?: string | null;
    contractCostMultiplier?: number;
    isEnabled?: boolean;
  }) {
    const parsed = llmProfileSchema.parse(input);
    assertSupportedModel(parsed.providerType, parsed.modelId);

    if (parsed.providerType === 'minimax' && !parsed.apiKey?.trim()) {
      throw new Error('MiniMax profiles require a direct apiKey');
    }

    const now = Date.now();
    const profileId = input.profileId ?? createId();
    const existing = input.profileId
      ? await db.query.llmProfiles.findFirst({
          where: eq(llmProfiles.id, input.profileId),
        })
      : null;

    if (existing) {
      await db
        .update(llmProfiles)
        .set({
          slug: parsed.slug,
          label: parsed.label,
          providerType: parsed.providerType,
          modelId: parsed.modelId,
          encryptedApiKey: shouldUseDirectApiKey(parsed.providerType, parsed.apiKey)
            ? encryptSecret(parsed.apiKey!.trim())
            : null,
          contractCostMultiplier: parsed.contractCostMultiplier,
          isEnabled: parsed.isEnabled ? 1 : 0,
          updatedAt: now,
        })
        .where(eq(llmProfiles.id, input.profileId!));
    } else {
      await db.insert(llmProfiles).values({
        id: profileId,
        slug: parsed.slug,
        label: parsed.label,
        providerType: parsed.providerType,
        modelId: parsed.modelId,
        encryptedApiKey: shouldUseDirectApiKey(parsed.providerType, parsed.apiKey)
          ? encryptSecret(parsed.apiKey!.trim())
          : null,
        contractCostMultiplier: parsed.contractCostMultiplier,
        isEnabled: parsed.isEnabled ? 1 : 0,
        createdAt: now,
        updatedAt: now,
      });
    }

    return {
      profileId,
      slug: parsed.slug,
      label: parsed.label,
      providerType: parsed.providerType,
      modelId: parsed.modelId,
      modelKey: buildPricingModelKey(parsed.providerType, parsed.modelId),
      runtimeModelKey: buildRuntimeModelKey({
        providerType: parsed.providerType,
        modelId: parsed.modelId,
        hasApiKey: shouldUseDirectApiKey(parsed.providerType, parsed.apiKey),
      }),
      apiKey: shouldUseDirectApiKey(parsed.providerType, parsed.apiKey) ? parsed.apiKey!.trim() : null,
      hasApiKey: shouldUseDirectApiKey(parsed.providerType, parsed.apiKey),
      contractCostMultiplier: parsed.contractCostMultiplier,
      isEnabled: parsed.isEnabled,
    };
  }

  async function deleteProfile(profileId: string) {
    const defaults = await getDefaults();

    if (
      defaults.primaryProfileId === profileId ||
      defaults.omProfileId === profileId ||
      defaults.hiringRhProfileId === profileId
    ) {
      throw new Error('Cannot delete an LLM profile that is currently selected as a system default');
    }

    await db.delete(llmProfiles).where(eq(llmProfiles.id, profileId));
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
        throw new Error(`Default LLM profile must be enabled: ${profile.label}`);
      }
    }

    const now = Date.now();
    const existing = await getDefaultsRow();

    if (existing) {
      await db
        .update(systemLlmDefaults)
        .set({
          primaryProfileId: parsed.primaryProfileId,
          omProfileId: parsed.omProfileId,
          hiringRhProfileId: parsed.hiringRhProfileId,
          updatedAt: now,
        })
        .where(eq(systemLlmDefaults.id, DEFAULTS_ROW_ID));
    } else {
      await db.insert(systemLlmDefaults).values({
        id: DEFAULTS_ROW_ID,
        primaryProfileId: parsed.primaryProfileId,
        omProfileId: parsed.omProfileId,
        hiringRhProfileId: parsed.hiringRhProfileId,
        createdAt: now,
        updatedAt: now,
      });
    }

    return parsed;
  }

  function listSupportedProviders() {
    return [
      {
        providerType: 'openai-codex' as const,
        label: 'OpenAI Codex',
        modelIds: [...SUPPORTED_MODELS['openai-codex']],
      },
      {
        providerType: 'claude-max' as const,
        label: 'Claude Max',
        modelIds: [...SUPPORTED_MODELS['claude-max']],
      },
      {
        providerType: 'minimax' as const,
        label: 'MiniMax Token Plan',
        modelIds: [...SUPPORTED_MODELS.minimax],
      },
    ];
  }

  async function getDefaultsRow() {
    return db.query.systemLlmDefaults.findFirst({
      where: eq(systemLlmDefaults.id, DEFAULTS_ROW_ID),
    });
  }

  return {
    listProfiles,
    getProfile,
    getDefaults,
    getResolvedDefaults,
    upsertProfile,
    deleteProfile,
    updateDefaults,
    listSupportedProviders,
  };
}

function assertSupportedModel(providerType: LlmProviderType, modelId: string) {
  const supportedModelIds = SUPPORTED_MODELS[providerType] as readonly string[];

  if (!supportedModelIds.includes(modelId)) {
    throw new Error(`Unsupported model for ${providerType}: ${modelId}`);
  }
}

function buildPricingModelKey(providerType: LlmProviderType, modelId: string) {
  if (providerType === 'openai-codex') {
    return openaiCodexProvider(modelId as (typeof OPENAI_CODEX_MODELS)[number]);
  }

  if (providerType === 'claude-max') {
    return claudeMaxProvider(modelId as (typeof CLAUDE_MAX_MODELS)[number]);
  }

  return `token-plan/minimax/${modelId}`;
}

function buildRuntimeModelKey(input: {
  providerType: LlmProviderType;
  modelId: string;
  hasApiKey: boolean;
}) {
  if (input.providerType === 'openai-codex') {
    return buildPricingModelKey(input.providerType, input.modelId);
  }

  if (!input.hasApiKey) {
    return buildPricingModelKey(input.providerType, input.modelId);
  }

  return `custom/${input.providerType}/${input.modelId}`;
}

function shouldUseDirectApiKey(providerType: LlmProviderType, apiKey?: string | null) {
  if (!apiKey?.trim()) {
    return false;
  }

  return providerType === 'claude-max' || providerType === 'minimax';
}
