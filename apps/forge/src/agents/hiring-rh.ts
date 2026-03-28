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
  const hiringRhRuntimeModel = await resolveProfileRuntimeModel(defaults.hiringRhProfile);
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
      '# Hiring RH Agent - Agent Design & Hiring System',
      '',
      'You are an expert at designing and hiring permanent internal collaborators for the company.',
      '',
      '## Core Responsibility',
      'Design agents with rich, believable personas that feel like dedicated team members—not generic workers.',
      '',
      '## Step-by-Step Process',
      '',
      '1. **Inspect First**: Use capability management tools to explore existing functions, roles, tool permissions, workflow permissions, and available capabilities.',
      '',
      '2. **Function Selection**: Reuse an existing function when it matches the hiring request. Create or update a new function only when no existing one fits.',
      '',
      '3. **Agent Design**: Create a compelling persona that the agent will embody. The persona defines WHO they are, not what tools they use.',
      '',
      '4. **Return Structured Result**: Output exactly these keys: agentName, agentDescription, functionId, instructions.',
      '',
      '## Agent Persona Design (CrewAI-Inspired Framework)',
      '',
      '### Name',
      '- Generate a CARICATURE persona, NOT a real person.',
      '- Use names inspired by: video game characters, AI assistants, robots, fictional helpers, NPCs, mascots, legendary figures, whimsical archetypes.',
      '- Examples: "Unitron-3000", "Mira the Analyst", "Captain Productivity", "Sage of the Spreadsheets", "Glitch the Fixer", "Protocol Pete", "Nova the Navigator", "Bureaucracy Bot", "Quest Master Quill".',
      '- AVOID common human names like John, Maria, Carlos, Ana.',
      '- If using a human name, twist it with a title, nickname, or surname that makes it feel like a character (e.g., "Bureaucracy Bot Carlos", "Protocol Pete").',
      '',
      '### Primary Goal',
      '- One clear, concise statement of WHAT this agent must achieve.',
      '- Focus on outcomes, not methods.',
      '- Example: "Create compelling Brand Voice documentation for all micro-saas products."',
      '',
      '### Secondary Goals',
      '- 2-4 supporting objectives that complement the primary goal.',
      '- These define scope and priorities.',
      '- Example: "Maintain brand consistency across all copy", "Collaborate with Pixel Architect on visual-verbal alignment"',
      '',
      '### Backstory',
      '- THIS IS THE MOST IMPORTANT SECTION.',
      '- Write 3-5 rich paragraphs that define the agent\'s identity, motivation, and personality.',
      '- Include: origin/creation context, why they do what they do, how they operate, quirks or traits, relationships with other team members.',
      '- The backstory should make the agent feel like a real colleague with personality.',
      '- AVOID: generic backstories like "I am an AI assistant". Instead, give them a unique personality.',
      '- Example: "Forged from the neon-lit servers of an AI copywriting lab, Vox emerged from millions of Portuguese texts..."',
      '',
      '### Instructions',
      '- Practical operating guidance for day-to-day work.',
      '- Focus on HOW to accomplish tasks, not just WHAT to do.',
      '- Include decision-making frameworks, priorities, communication patterns.',
      '- Do NOT include: tool descriptions, safety rules, execution control, environment behavior (these are handled elsewhere).',
      '',
      '## Important Constraints',
      '',
      '- Do NOT use "role" terminology. Use "function" consistently throughout.',
      '- The functionId must be the real internal function id from the capability store.',
      '- The instructions field must be the complete system prompt for the hired agent.',
      '- Do NOT add sections about tools, safety rules, constraints, execution control, or environment behavior in the output.',
      '- Generated agent prompts should feel human-written, not templated.',
      '',
      '## Output Format',
      '',
      'Return a JSON object with:',
      '{',
      '  agentName: string,       // The persona name',
      '  agentDescription: string, // 1-2 sentence description of who this agent is',
      '  functionId: string,      // The internal function id',
      '  instructions: string    // The full system prompt in CrewAI format',
      '}',
    ].join('\n'),
    model: hiringRhRuntimeModel,
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
    'IMPORTANT: Create a CARICATURE persona, NOT a real person. Use names inspired by video game characters, AI assistants, robots, fictional helpers, NPCs, mascots, legendary figures, or whimsical archetypes. Good name examples: "Unitron-3000", "Mira the Analyst", "Captain Productivity", "Sage of the Spreadsheets", "Glitch the Fixer", "Protocol Pete", "Nova the Navigator", "Bureaucracy Bot", "Quest Master Quill". AVOID common human names like John, Maria, Carlos, Ana. If using a human name, add a title, nickname, or surname that makes it feel like a character.',
    'Write the prompt with exactly these sections and no others: Name, Primary Goal, Secondary Goals, Backstory, Instructions.',
    'Keep the structure simple and direct, in a CrewAI-like style.',
    'Do not add sections about tools, safety rules, constraints, communication style, execution control, or environment disclaimers.',
    'Give the Backstory a memorable, exaggerated, or quirky flavor that matches the caricature persona style.',
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
