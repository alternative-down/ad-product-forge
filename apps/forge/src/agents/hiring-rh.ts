import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core';
import { eq } from 'drizzle-orm';

import type { Database } from '../database/index.js';
import { llmModelPrices } from '../database/schema.js';
import { createCompanyCashLedger } from '../finance/company-cash-ledger.js';
import { createOAuthGateway } from '@mastra-engine/core';

const HIRING_RH_AGENT_ID = 'internal-hiring-rh';
const HIRING_RH_MODEL = 'account-oauth/openai-codex/gpt-5.4-mini';

export async function generateHiredAgentInstructions(db: Database, input: {
  requestedFunction: string;
  additionalContext?: string;
}) {
  const companyCash = createCompanyCashLedger(db);
  const modelPrice = await db.query.llmModelPrices.findFirst({
    where: eq(llmModelPrices.modelKey, HIRING_RH_MODEL),
  });
  const hiringPrompt = buildHiringPrompt(input);

  if (!modelPrice) {
    throw new Error(`Missing LLM model price for hiring workflow: ${HIRING_RH_MODEL}`);
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
    model: HIRING_RH_MODEL,
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
  const inputTokens = result.usage.inputTokens ?? 0;
  const outputTokens = result.usage.outputTokens ?? 0;
  const costUsd =
    (inputTokens / 1_000_000) * modelPrice.inputPerMillionUsd +
    (outputTokens / 1_000_000) * modelPrice.outputPerMillionUsd;

  await companyCash.postEntry({
    type: 'agent-hiring-process',
    direction: 'out',
    amountUsd: costUsd,
    description: `Hiring workflow cost for ${input.requestedFunction}`,
    referenceType: 'hiring-workflow',
  });

  return {
    instructions: result.text.trim(),
    costUsd,
    modelKey: HIRING_RH_MODEL,
  };
}

function buildHiringPrompt(input: {
  requestedFunction: string;
  additionalContext?: string;
}) {
  const sections = [
    'Write the full system prompt for a newly hired permanent internal collaborator.',
    `Professional function: ${input.requestedFunction.trim()}`,
    'The collaborator works inside the company and primarily communicates through internal-chat.',
    'The prompt should be direct, practical, execution-oriented, and written as the hired agent instructions.',
    'Return only the system prompt text with no markdown fences, no explanation, and no extra commentary.',
  ];

  if (input.additionalContext?.trim()) {
    sections.push(`Additional hiring context:\n${input.additionalContext.trim()}`);
  }

  return sections.join('\n\n');
}

function estimateTextTokens(text: string) {
  return Math.ceil(text.length / 4);
}
