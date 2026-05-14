import { createId } from '../utils/id';
import { eq } from 'drizzle-orm';
import { z } from 'zod';


import type {Database} from '../database/schema';
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
    const rows = await db.query.llmProfiles.findMany({
      orderBy: (fields, { asc }) => [asc(fields.modelKey)],
    });

    return rows.map(toProfileRecord);
    } catch (err) {
    forgeDebug({ scope: 'llm-settings', level: 'info', message: 'Failed to list LLM profiles', context: { error: err instanceof Error ? err.message : String(err) } });
    throw err;

    if (existing) {
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
        .where(eq(llmProfiles.id, input.profileId!));
    } catch (err) {
      forgeDebug({ scope: 'llm-settings', level: 'info', message: 'Failed to update LLM profile', context: { profileId, error: err instanceof Error ? err.message : String(err) } });
      throw err;
    }

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
    const defaults = await getDefaults();

    if (defaults && (
      defaults.primaryProfileId === profileId ||
      defaults.omProfileId === profileId ||
      defaults.hiringRhProfileId === profileId
    )) {
      forgeDebug({ scope: 'llm-settings', level: 'warn', message: 'deleteModelProfile: cannot delete selected system default', context: { profileId } });
      throw new Error('Cannot delete an LLM profile that is currently selected as a system default');
    }

    await db.delete(llmProfiles).where(eq(llmProfiles.id, profileId));
    } catch (err) {
    forgeDebug({ scope: 'llm-settings', level: 'info', message: 'Failed to delete LLM profile', context: { profileId, error: err instanceof Error ? err.message : String(err) } });
    throw err;

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
    } catch (err) {
      forgeDebug({ scope: 'llm-settings', level: 'info', message: 'Failed to update LLM defaults', context: { error: err instanceof Error ? err.message : String(err) } });
      throw err;
    }

    return parsed;
  }

  async function getDefaultsRow() {
      return await db.query.systemLlmDefaults.findFirst({
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
