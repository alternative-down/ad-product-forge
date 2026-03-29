import type { Database } from './index';
import { llmProfiles } from './schema';

const LLM_PROFILES = [
  {
    id: 'profile-openai-gpt54',
    name: 'GPT-5.4',
    modelKey: 'account-oauth/openai-codex/gpt-5.4',
    baseUrl: 'https://api.openai.com/v1',
    encryptedApiKey: '', // Placeholder - set real key in production
    contractCostMultiplier: 1,
    isEnabled: 1,
  },
  {
    id: 'profile-openai-gpt54nano',
    name: 'GPT-5.4 Nano',
    modelKey: 'account-oauth/openai-codex/gpt-5.4-nano',
    baseUrl: 'https://api.openai.com/v1',
    encryptedApiKey: '', // Placeholder - set real key in production
    contractCostMultiplier: 1,
    isEnabled: 1,
  },
  {
    id: 'profile-openai-gpt54mini',
    name: 'GPT-5.4 Mini',
    modelKey: 'account-oauth/openai-codex/gpt-5.4-mini',
    baseUrl: 'https://api.openai.com/v1',
    encryptedApiKey: '', // Placeholder - set real key in production
    contractCostMultiplier: 1,
    isEnabled: 1,
  },
  {
    id: 'profile-claude-opus',
    name: 'Claude Opus 4',
    modelKey: 'account-oauth/claude-code/claude-opus-4-6',
    baseUrl: 'https://api.anthropic.com/v1',
    encryptedApiKey: '', // Placeholder - set real key in production
    contractCostMultiplier: 1,
    isEnabled: 1,
  },
  {
    id: 'profile-claude-sonnet',
    name: 'Claude Sonnet 4',
    modelKey: 'account-oauth/claude-code/claude-sonnet-4-6',
    baseUrl: 'https://api.anthropic.com/v1',
    encryptedApiKey: '', // Placeholder - set real key in production
    contractCostMultiplier: 1,
    isEnabled: 1,
  },
  {
    id: 'profile-claude-haiku',
    name: 'Claude Haiku 4',
    modelKey: 'account-oauth/claude-code/claude-haiku-4-5',
    baseUrl: 'https://api.anthropic.com/v1',
    encryptedApiKey: '', // Placeholder - set real key in production
    contractCostMultiplier: 1,
    isEnabled: 1,
  },
  {
    id: 'profile-minimax',
    name: 'MiniMax M2.5',
    modelKey: 'minimax-coding-plan/MiniMax-M2.5',
    baseUrl: 'https://api.minimax.io',
    encryptedApiKey: '', // Placeholder - set real key in production
    contractCostMultiplier: 1,
    isEnabled: 1,
  },
] as const;

export async function seedLlmProfiles(db: Database) {
  const now = Date.now();

  for (const profile of LLM_PROFILES) {
    // Use INSERT OR REPLACE for idempotent upsert - handles duplicates gracefully
    await db.insert(llmProfiles).values({
      id: profile.id,
      name: profile.name,
      modelKey: profile.modelKey,
      baseUrl: profile.baseUrl,
      encryptedApiKey: profile.encryptedApiKey,
      contractCostMultiplier: profile.contractCostMultiplier,
      isEnabled: profile.isEnabled,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: llmProfiles.id,
      set: {
        name: profile.name,
        modelKey: profile.modelKey,
        baseUrl: profile.baseUrl,
        encryptedApiKey: profile.encryptedApiKey,
        contractCostMultiplier: profile.contractCostMultiplier,
        isEnabled: profile.isEnabled,
        updatedAt: now,
      },
    });
  }
}
