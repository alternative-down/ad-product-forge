import { eq } from 'drizzle-orm';

import type { Database } from './index';
import { llmProfiles } from './schema';
import { encryptSecret } from '../encryption/crypto';

const DEFAULT_LLM_PROFILE_API_KEY = 'configured-via-admin-or-oauth';

const DEFAULT_LLM_PROFILES = [
  {
    id: 'openai-codex-gpt-5.4-primary',
    modelKey: 'account-oauth/openai-codex/gpt-5.4',
  },
  {
    id: 'openai-codex-gpt-5.4-mini-om',
    modelKey: 'account-oauth/openai-codex/gpt-5.4-mini',
  },
  {
    id: 'openai-codex-gpt-5.4-mini-hiring-rh',
    modelKey: 'account-oauth/openai-codex/gpt-5.4-mini',
  },
  {
    id: 'claude-max-claude-sonnet-4-6-primary',
    modelKey: 'account-oauth/claude-code/claude-sonnet-4-6',
  },
  {
    id: 'claude-max-claude-haiku-4-5-om',
    modelKey: 'account-oauth/claude-code/claude-haiku-4-5',
  },
  {
    id: 'claude-max-claude-haiku-4-5-hiring-rh',
    modelKey: 'account-oauth/claude-code/claude-haiku-4-5',
  },
  {
    id: 'minimax-m2-7-primary',
    modelKey: 'minimax/MiniMax-M2.7',
  },
  {
    id: 'minimax-m2-7-om',
    modelKey: 'minimax/MiniMax-M2.7',
  },
  {
    id: 'minimax-m2-7-hiring-rh',
    modelKey: 'minimax/MiniMax-M2.7',
  },
] as const;

export async function seedDefaultLlmProfiles(db: Database) {
  const now = Date.now();
  const encryptedApiKey = encryptSecret(DEFAULT_LLM_PROFILE_API_KEY);

  for (const profile of DEFAULT_LLM_PROFILES) {
    const existing = await db.query.llmProfiles.findFirst({
      where: eq(llmProfiles.id, profile.id),
    });

    if (!existing) {
      await db.insert(llmProfiles).values({
        id: profile.id,
        modelKey: profile.modelKey,
        baseUrl: null,
        encryptedApiKey,
        contractCostMultiplier: 1,
        isEnabled: 1,
        createdAt: now,
        updatedAt: now,
      });
      continue;
    }

    if (existing.encryptedApiKey) {
      continue;
    }

    await db
      .update(llmProfiles)
      .set({
        encryptedApiKey,
        updatedAt: now,
      })
      .where(eq(llmProfiles.id, profile.id));
  }
}
