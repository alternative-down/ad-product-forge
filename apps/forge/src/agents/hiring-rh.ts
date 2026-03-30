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
import { createTool } from '@mastra/core/tools';
import type { Processor, ProcessInputStepArgs, ProcessInputStepResult } from '@mastra/core/processors';

/**
 * Processor that disables tools after hireAgent tool is called.
 * This forces the agent to return text output instead of continuing tool calls.
 */
class HireAgentDisablerProcessor implements Processor {
  id = 'hire-agent-disabler';

  async processInputStep({
    stepNumber,
    steps,
  }: ProcessInputStepArgs): Promise<ProcessInputStepResult> {
    // On first step, allow tools
    if (stepNumber === 0) {
      console.log(`[HireAgentDisabler] Step ${stepNumber}: allowing tools`);
      return {};
    }

    // Check if hireAgent was called in previous steps using steps parameter
    const hasHireAgentCall = steps.some((step) => {
      return step.toolCalls?.some((call) => call.name === 'hireAgent');
    });

    if (hasHireAgentCall) {
      console.log(`[HireAgentDisabler] Step ${stepNumber}: hireAgent detected, disabling tools`);
      return { toolChoice: 'none' };
    }

    console.log(`[HireAgentDisabler] Step ${stepNumber}: allowing tools`);
    return {};
  }
}

const HIRING_RH_AGENT_ID = 'internal-hiring-rh';
const HIRING_RH_TOOL_IDS = new Set([
  'list_agent_functions',
  'create_agent_function',
  'update_agent_function',
  'delete_agent_function',
  'list_agent_roles',
  'create_agent_role',
  'update_agent_role',
  'delete_agent_role',
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

type HiringRhResult =
  | { valid: false; error: string }
  | {
      valid: true;
      agentName: string;
      agentDescription: string;
      functionId: string;
      instructions: string;
      functionName: string;
      functionDescription: string | undefined;
      costUsd: number;
      modelKey: string;
    };

export async function generateHiredAgentInstructions(
  db: Database,
  input: {
    hiringRequest: string;
    additionalContext?: string;
    loaderConfig: AgentLoaderConfig;
  },
): Promise<HiringRhResult> {
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

  console.log(`[HiringRH] Tools loaded for agent ${HIRING_RH_AGENT_ID}:`, {
    count: Object.keys(tools).length,
    toolIds: Object.keys(tools),
    allowedToolIds: Array.from(HIRING_RH_TOOL_IDS),
  });

  if (currentBalanceUsd < estimatedCostUsd) {
    throw new Error('Insufficient company cash for hiring workflow');
  }

  const inputSchema = z.object({
    agent: hiringRhResultSchema,
  });

  // NOTE: inputSchema kept for reference but we now use toolResults instead of args

  const agent = new Agent({
    id: HIRING_RH_AGENT_ID,
    name: 'Internal Hiring RH',
    instructions: [
      '# Hiring RH Agent - Agent Design & Hiring System',
      '',
      'You are an expert at designing and hiring permanent internal collaborators for the company.',
      '',
      '## Core Responsibility',
      'Design agents that feel like specialized team members—not generic workers. Each agent should have a clear domain expertise, measurable goals, and operational instructions that enable them to complete tasks autonomously.',
      '',
      '## Debugging & Status Reporting',
      '',
      'IMPORTANT: Use the "reportHiringState" tool to describe:',
      '- What you currently see (functions, roles, capabilities)',
      '- What you are trying to accomplish',
      '- Any tools you tried and their results',
      '- Any difficulties or errors you encounter',
      '',
      'This helps debug the hiring process. Be thorough and descriptive in your status reports.',
      '',
      '## Step-by-Step Process',
      '',
      '1. **Report Initial State**: Call reportHiringState to describe what you see available.',
      '',
      '2. **Inspect First**: Use capability management tools to explore existing functions, tool permissions, workflow permissions, and available capabilities.',
      '',
      '3. **Function Selection**: Reuse an existing function when it matches the hiring request. Create or update a new function only when no existing one fits.',
      '',
      '4. **Report Progress**: After each major step, call reportHiringState to describe what you found and what you plan to do next.',
      '',
      '5. **Finalize Hiring**: When ready, call hireAgent with the complete agent profile.',
      '',
      '6. **Report Final Result**: Call reportHiringState to confirm the hiring was successful or describe any errors.',
      '',
      '## Agent Design Framework (CrewAI Best Practices)',
      '',
      '### Role',
      '- Be specific and specialized. Instead of "Writer", use "Technical Content Writer specializing in micro-saas product descriptions".',
      '- Include domain expertise and professional context.',
      '- Examples:',
      '  - "Senior Brand Voice Specialist focusing on Brazilian Portuguese digital products"',
      '  - "Full-Stack Software Engineer with expertise in Next.js and drizzle ORM"',
      '  - "Customer Success Manager specializing in micro-saas onboarding"',
      '',
      '### Goal',
      '- One clear, outcome-focused statement of what this agent must achieve.',
      '- Emphasize quality standards and success criteria.',
      '- Example: "Create compelling, conversion-focused product copy for Brazilian e-commerce platforms while maintaining brand voice consistency."',
      '',
      '### Backstory',
      '- Write 2-3 paragraphs establishing professional expertise and working style.',
      '- Focus on: domain knowledge, relevant experience, how they approach problems, what drives their work.',
      '- AVOID: fictional characters, caricatures, robot names, or whimsical archetypes.',
      '- Example: "With 5+ years of experience creating copy for Brazilian e-commerce, you understand the nuances of Mercado Livre, Shopee, and Amazon BR listings. You specialize in crafting product descriptions that convert while respecting local cultural context..."',
      '',
      '### Instructions',
      '- Practical day-to-day operating guidance.',
      '- Focus on HOW to accomplish tasks: decision frameworks, priorities, communication patterns.',
      '- Include any specific tools or workflows this agent should use.',
      '- Do NOT include: tool descriptions, safety rules, execution control, environment behavior (handled elsewhere).',
      '',
      '## Important Constraints',
      '',
      '- Use "function" terminology consistently. Do NOT use "role".',
      '- The functionId must be a real internal function id from the capability store.',
      '- Generated agent prompts should feel professionally written, not templated.',
      '- Each agent should be able to COMPLETE TASKS AUTONOMOUSLY with clear object and completion criteria.',
      '',
      '## Output Structure',
      '',
      'Return the agent profile in this format:',
      '',
      'Agent Name: [name]',
      'Agent Description: [1-2 sentence description]',
      'Function ID: [internal function id]',
      '',
      'System Prompt:',
      '[Full system prompt with Role, Goal, Backstory, and Instructions sections]',
    ].join('\n'),
    model: hiringRhRuntimeModel,
    tools: {
      reportHiringState: createTool({
        id: 'reportHiringState',
        description: 'Use this tool to report what you see, what tools are available, and any difficulties you encounter during the hiring process. This helps with debugging.',
        inputSchema: z.object({
          status: z.string().describe('Describe what you currently see, what tools you have access to, what you are trying to do, and any issues or difficulties.'),
        }),
        execute: async ({ status }) => {
          console.log(`[HiringRH] Agent status report:`, status);
          return { ok: true, logged: status };
        },
      }),
      hireAgent: createTool({
        id: 'hireAgent',
        description: 'Realiza contratação do agente e finaliza o processo',
        inputSchema,
        execute: async ({ agent }) => {
          console.log(`[HiringRH] hireAgent called with:`, JSON.stringify(agent, null, 2));
          
          const agentFunction = await capabilities.getFunction(agent.functionId);
          console.log(`[HiringRH] getFunction(${agent.functionId}) result:`, JSON.stringify(agentFunction, null, 2));

          if (!agentFunction) {
            console.log(`[HiringRH] hireAgent ERROR: Function not found`);
            return {
              error: `Function ID "${agent.functionId}" does not exist. Please use list_agent_functions to see available functions, then use create_agent_function to create a new function, or provide a valid existing functionId.`,
              valid: false,
            };
          }

          const result = {
            ...agent,
            functionId: agentFunction.functionId,
            functionName: agentFunction.name,
            functionDescription: agentFunction.description,
            valid: true,
          };
          console.log(`[HiringRH] hireAgent SUCCESS, returning:`, JSON.stringify(result, null, 2));
          return result;
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
    processors: [new HireAgentDisablerProcessor()],
  });
  const result = await mastra.getAgent(HIRING_RH_AGENT_ID)!.generate(hiringPrompt, {
    maxSteps: 20,
    toolChoice: 'required',
  });

  const inputTokens = result.usage.inputTokens ?? 0;
  const outputTokens = result.usage.outputTokens ?? 0;
  const costUsd =
    (inputTokens / 1_000_000) * modelPrice.inputPerMillionUsd +
    (outputTokens / 1_000_000) * modelPrice.outputPerMillionUsd;

  console.log(`[HiringRH] generate() completed`);
  console.log(`[HiringRH] result.text:`, result.text);
  console.log(`[HiringRH] result.toolCalls:`, JSON.stringify(result.toolCalls.map(c => ({ toolName: c.payload.toolName })), null, 2));
  console.log(`[HiringRH] result.toolResults:`, JSON.stringify(result.toolResults.map(r => ({ toolName: r.toolName, hasResult: !!r.result })), null, 2));

  // After hireAgent is called, the next step disables tools and returns text
  // Parse the text to extract the structured result
  const toolCall = result.toolCalls.find((call) => call.payload.toolName === 'hireAgent');
  const toolResult = result.toolResults.find((r) => r.toolName === 'hireAgent');

  console.log(`[HiringRH] toolCall found:`, !!toolCall);
  console.log(`[HiringRH] toolResult found:`, !!toolResult);

  // If we have toolResult from hireAgent, use it
  if (toolResult?.result) {
    console.log(`[HiringRH] toolResult.result:`, JSON.stringify(toolResult.result, null, 2));
    const agentHired = toolResult.result as HiringRhResult;
    if (agentHired.valid) {
      console.log(`[HiringRH] SUCCESS - agentHired from toolResult:`, JSON.stringify(agentHired, null, 2));
      return {
        agentName: agentHired.agentName,
        agentDescription: agentHired.agentDescription,
        functionId: agentHired.functionId,
        functionName: agentHired.functionName!,
        functionDescription: agentHired.functionDescription,
        instructions: agentHired.instructions,
        costUsd,
        modelKey: hiringRhModelKey,
        valid: true,
      };
    }
  }

  console.log(`[HiringRH] ERROR: Could not extract hiring data from response`);
  return {
    error: 'Hiring process did not return valid agent data. Please try again.',
    valid: false,
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
    'Inspect the current capability structure with tools before deciding whether to reuse or change functions and roles.',
    'After designing the agent profile, you MUST call the tool "hireAgent" with the structured data to finalize the hiring.',
    'The hireAgent tool requires an object with: agentName, agentDescription, functionId, instructions.',
    'IMPORTANT: Create a CARICATURE persona, NOT a real person. Use names inspired by video game characters, AI assistants, robots, fictional helpers, NPCs, mascots, legendary figures, or whimsical archetypes. Good name examples: "Unitron-3000", "Mira the Analyst", "Captain Productivity", "Sage of the Spreadsheets", "Glitch the Fixer", "Protocol Pete", "Nova the Navigator", "Bureaucracy Bot", "Quest Master Quill". AVOID common human names like John, Maria, Carlos, Ana. If using a human name, add a title, nickname, or surname that makes it feel like a character.',
    'Write the prompt with exactly these sections and no others: Name, Primary Goal, Secondary Goals, Backstory, Instructions.',
    'Keep the structure simple and direct, in a CrewAI-like style.',
    'Do not add sections about tools, safety rules, constraints, communication style, execution control, or environment disclaimers.',
    'Give the Backstory a memorable, exaggerated, or quirky flavor that matches the caricature persona style.',
    'Put the practical operating guidance into Instructions.',
    'The collaborator works inside the company and primarily communicates through internal-chat.',
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
