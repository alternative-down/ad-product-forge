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
import { createCapabilityTools } from '../capabilities/tools';
import type { AgentLoaderConfig } from './agent-loader';
import { createCapabilityStore } from '../capabilities/store';
import { createSystemSettingsStore } from '../system-settings/store';
import { hasToolCall } from 'ai';
import { createTool } from '@mastra/core/tools';

const HIRING_RH_AGENT_ID = 'internal-hiring-rh';
const HIRING_RH_TOOL_IDS = new Set([
  'list_agent_functions',
  'manage_agent_function',
  'list_agent_roles',
  'manage_agent_role',
  'assign_role_to_function',
  'list_role_tool_permissions',
  'manage_role_tool_permissions',
  'list_role_workflow_permissions',
  'manage_role_workflow_permissions',
  'list_available_capabilities',
] as const);
const hiringRhResultSchema = z.object({
  agentName: z.string().min(1),
  agentDescription: z.string().min(1),
  functionId: z.string().min(1),
  instructions: z.string().min(1),
});

export async function generateHiredAgentInstructions(
  db: Database,
  input: {
    hiringRequest: string;
    additionalContext?: string;
    loaderConfig: AgentLoaderConfig;
  },
) {
  const llmSettings = createLlmSettingsStore(db);
  const capabilities = createCapabilityStore(db);
  const systemSettings = createSystemSettingsStore(db);
  const defaults = await llmSettings.getResolvedDefaults();
  const companySettings = await systemSettings.getSettings();
  const hiringRhModelKey = defaults.hiringRhProfile.modelKey;
  const companyCash = createCompanyCashLedger(db);
  const modelPrice = await db.query.llmModelPrices.findFirst({
    where: eq(llmModelPrices.modelKey, hiringRhModelKey),
  });
  const hiringPrompt = buildHiringPrompt({
    ...input,
    companyName: companySettings.companyName,
    companyContext: companySettings.companyContext,
  });

  if (!modelPrice) {
    throw new Error(`Missing LLM model price for hiring workflow: ${hiringRhModelKey}`);
  }

  const estimatedInputTokens = estimateTextTokens(hiringPrompt);
  const estimatedCostUsd = (estimatedInputTokens / 1_000_000) * modelPrice.inputPerMillionUsd;
  const currentBalanceUsd = await companyCash.getCurrentBalanceUsd();
  const tools = createCapabilityTools(
    db,
    input.loaderConfig,
    HIRING_RH_AGENT_ID,
    HIRING_RH_TOOL_IDS,
  );

  if (currentBalanceUsd < estimatedCostUsd) {
    throw new Error('Insufficient company cash for hiring workflow');
  }

  const inputSchema = z.object({
    agent: hiringRhResultSchema,
  });

  const agent = new Agent({
    id: HIRING_RH_AGENT_ID,
    name: 'Internal Hiring RH',
    instructions: [
      'You design and hire permanent internal collaborators for the company.',
      'Use the capability management tools to inspect existing functions, roles, tool permissions, workflow permissions, and available capabilities before deciding the final structure.',
      'Reuse an existing function when it already matches the hiring request.',
      'When no existing function fits, create or update the required function, roles, role tool permissions, role workflow permissions, and role-to-function assignments through tools.',
      'Return a structured object with exactly these keys: agentName, agentDescription, functionId, instructions.',
      'The functionId must be the real internal function id that should be assigned to the hired agent.',
      'The instructions field must be the full system prompt for the hired agent.',
      'The hired agent must be a persona, not a generic worker type.',
      'Write the system prompt in a simple CrewAI-like format with exactly these sections: Name, Primary Goal, Secondary Goals, Backstory, Instructions.',
      'Do not add sections about tools, safety rules, constraints, execution control, communication style, or environment behavior.',
      'Use Backstory to make the collaborator feel like a specific person with identity, motivation, and way of operating inside the company.',
      'Use Instructions only for the practical operating guidance that this persona should follow in day-to-day work.',
    ].join('\n'),
    model: resolveProfileRuntimeModel(defaults.hiringRhProfile),
    tools: {
      hireAgent: createTool({
        id: 'hireAgent',
        description: 'Realiza contratação do agente e finaliza o processo',
        inputSchema,
        execute: async ({ agent }) => {
          const agentFunction = await capabilities.getFunction(agent.functionId);

          if (!agentFunction) {
            throw new Error(`Hiring RH returned unknown functionId: ${agent.functionId}`);
          }

          return {
            ...agent,
            functionId: agentFunction.functionId,
            functionName: agentFunction.name,
            functionDescription: agentFunction.description,
          };
        },
      }),
      ...tools,
    },
  });
  const mastra = new Mastra({
    agents: {
      [HIRING_RH_AGENT_ID]: agent,
    },
    gateways: {
      oauth: createOAuthGateway(),
    },
  });
  const result = await mastra.getAgent(HIRING_RH_AGENT_ID)!.generate(hiringPrompt, {
    maxSteps: 1000,
    toolChoice: 'required',
    stopWhen: [hasToolCall('hireAgent')],
    // structuredOutput: {
    //   schema: hiringRhResultSchema,
    // },
    providerOptions: {
      anthropic: {
        thinking: { type: 'enabled', budgetTokens: 12000 },
      },
    },
  });

  const inputTokens = result.usage.inputTokens ?? 0;
  const outputTokens = result.usage.outputTokens ?? 0;
  const costUsd =
    (inputTokens / 1_000_000) * modelPrice.inputPerMillionUsd +
    (outputTokens / 1_000_000) * modelPrice.outputPerMillionUsd;

  const toolCall = result.toolCalls.find((call) => call.payload.toolName === 'hireAgent');
  if (!toolCall) throw new Error('Hiring RH not returned agent data');

  const { agent: agentHired } = toolCall.payload.args as z.infer<typeof inputSchema>;
  const agentFunction = await capabilities.getFunction(agentHired.functionId);

  if (!agentFunction) {
    throw new Error(`Hiring RH returned unknown functionId: ${agentHired.functionId}`);
  }

  return {
    ...agentHired,
    functionName: agentFunction.name,
    functionDescription: agentFunction.description,
    costUsd,
    modelKey: hiringRhModelKey,
  };
}

function buildHiringPrompt(input: {
  hiringRequest: string;
  additionalContext?: string;
  companyName?: string;
  companyContext?: string;
}) {
  const sections = [
    'Design one newly hired permanent internal collaborator from the hiring request.',
    `Hiring request:\n${input.hiringRequest.trim()}`,
    'The collaborator works inside the company and primarily communicates through internal-chat.',
    'Inspect the current capability structure with tools before deciding whether to reuse or change functions and roles.',
    'Return a structured object with exactly these keys: agentName, agentDescription, functionId, instructions.',
    'The functionId must be a real internal function id created or selected through tools.',
    'The instructions field must be the full system prompt for the hired agent.',
    'The hired agent must be a persona with a clear identity, not a generic worker type.',
    'Write the prompt with exactly these sections and no others: Name, Primary Goal, Secondary Goals, Backstory, Instructions.',
    'Keep the structure simple and direct, in a CrewAI-like style.',
    'Do not add sections about tools, safety rules, constraints, communication style, execution control, or environment disclaimers.',
    'Put identity, motivation, and personality into Backstory.',
    'Put the practical operating guidance into Instructions.',
  ];

  if (input.companyName?.trim() || input.companyContext?.trim()) {
    sections.push(
      [
        'Company context:',
        input.companyName?.trim() ? `Company name: ${input.companyName.trim()}` : null,
        input.companyContext?.trim() ? `Company information: ${input.companyContext.trim()}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  if (input.additionalContext?.trim()) {
    sections.push(`Additional hiring context:\n${input.additionalContext.trim()}`);
  }

  return sections.join('\n\n');
}

function estimateTextTokens(text: string) {
  return Math.ceil(text.length / 4);
}
