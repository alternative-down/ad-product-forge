import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core';
import { eq } from 'drizzle-orm';

import type { Database } from '../database/index';
import { llmModelPrices } from '../database/schema';
import { createCompanyCashLedger } from '../finance/company-cash-ledger';
import { createLlmSettingsStore } from '../llm/settings-store';
import { createOAuthGateway } from '@mastra-engine/core';
import { resolveProfileRuntimeModel } from '../llm/runtime-model';
import { z } from 'zod';

const HIRING_RH_AGENT_ID = 'internal-hiring-rh';
const hiringRhResultSchema = z.object({
  agentName: z.string().min(1),
  agentDescription: z.string().min(1),
  functionName: z.string().min(1),
  functionDescription: z.string().min(1),
  instructions: z.string().min(1),
});

export async function generateHiredAgentInstructions(db: Database, input: {
  hiringRequest: string;
  additionalContext?: string;
}) {
  const llmSettings = createLlmSettingsStore(db);
  const defaults = await llmSettings.getResolvedDefaults();
  const hiringRhModelKey = defaults.hiringRhProfile.modelKey;
  const companyCash = createCompanyCashLedger(db);
  const modelPrice = await db.query.llmModelPrices.findFirst({
    where: eq(llmModelPrices.modelKey, hiringRhModelKey),
  });
  const hiringPrompt = buildHiringPrompt(input);

  if (!modelPrice) {
    throw new Error(`Missing LLM model price for hiring workflow: ${hiringRhModelKey}`);
  }

  const estimatedInputTokens = estimateTextTokens(hiringPrompt);
  const estimatedCostUsd = (estimatedInputTokens / 1_000_000) * modelPrice.inputPerMillionUsd;
  const currentBalanceUsd = await companyCash.getCurrentBalanceUsd();

  if (currentBalanceUsd < estimatedCostUsd) {
    throw new Error('Insufficient company cash for hiring workflow');
  }

  const agent = new Agent({
    id: HIRING_RH_AGENT_ID,
    name: 'Internal Hiring RH',
    instructions: 'Write only the hired agent system prompt. Return plain text only.',
    model: resolveProfileRuntimeModel(defaults.hiringRhProfile),
  });
  const mastra = new Mastra({
    agents: {
      [HIRING_RH_AGENT_ID]: agent,
    },
    gateways: {
      oauth: createOAuthGateway(),
    },
  });
  const result = await mastra.getAgent(HIRING_RH_AGENT_ID)!.generate(hiringPrompt);
  const parsed = hiringRhResultSchema.parse(JSON.parse(result.text));
  const inputTokens = result.usage.inputTokens ?? 0;
  const outputTokens = result.usage.outputTokens ?? 0;
  const costUsd =
    (inputTokens / 1_000_000) * modelPrice.inputPerMillionUsd +
    (outputTokens / 1_000_000) * modelPrice.outputPerMillionUsd;

  return {
    agentName: parsed.agentName.trim(),
    agentDescription: parsed.agentDescription.trim(),
    functionName: parsed.functionName.trim(),
    functionDescription: parsed.functionDescription.trim(),
    instructions: parsed.instructions.trim(),
    costUsd,
    modelKey: hiringRhModelKey,
  };
}

function buildHiringPrompt(input: {
  hiringRequest: string;
  additionalContext?: string;
}) {
  const sections = [
    'Design one newly hired permanent internal collaborator from the hiring request.',
    `Hiring request:\n${input.hiringRequest.trim()}`,
    'The collaborator works inside the company and primarily communicates through internal-chat.',
    'Return only valid JSON with exactly these keys: agentName, agentDescription, functionName, functionDescription, instructions.',
    'The instructions field must be the full system prompt for the hired agent.',
    'Do not wrap the JSON in markdown fences.',
  ];

  if (input.additionalContext?.trim()) {
    sections.push(`Additional hiring context:\n${input.additionalContext.trim()}`);
  }

  return sections.join('\n\n');
}

function estimateTextTokens(text: string) {
  return Math.ceil(text.length / 4);
}
