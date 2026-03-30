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

    const hasSuccessfulHireAgentResult = steps.some((step) =>
      step.toolResults?.some((toolResult) => hasSuccessfulHireAgentToolResult(toolResult)),
    );

    if (hasSuccessfulHireAgentResult) {
      console.log(
        `[HireAgentDisabler] Step ${stepNumber}: valid hireAgent result detected, disabling tools`,
      );
      return { tools: {}, toolChoice: 'none' };
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
const REQUIRED_HIRING_TOOL_IDS = [
  'list_contacts',
  'get_contact',
  'upsert_contact',
  'list_conversations',
  'get_messages',
  'send_message',
  'list_agent_schedules',
  'create_agent_schedule',
  'update_agent_schedule',
  'delete_agent_schedule',
] as const;
const hiringRhResultSchema = z.object({
  agentName: z.string().min(1),
  agentDescription: z.string().min(1),
  functionId: z.string().min(1),
  instructions: z.string().min(1),
});
const hireAgentSuccessSchema = hiringRhResultSchema.extend({
  valid: z.literal(true),
  functionName: z.string().min(1),
  functionDescription: z.string().optional(),
});
const hireAgentFailureSchema = z.object({
  valid: z.literal(false),
  error: z.string().min(1),
  hint: z.string().min(1).optional(),
});
const hireAgentToolResultSchema = z.union([hireAgentSuccessSchema, hireAgentFailureSchema]);

type HiringRhResult =
  | { valid: false; error: string; hint?: string }
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

function isSuccessfulHireAgentResult(result: unknown) {
  const parsed = hireAgentSuccessSchema.safeParse(result);
  return parsed.success && parsed.data.valid;
}

function hasSuccessfulHireAgentToolResult(toolResult: unknown) {
  if (typeof toolResult !== 'object' || toolResult === null) {
    return false;
  }

  if (
    'toolName' in toolResult &&
    toolResult.toolName === 'hireAgent' &&
    'result' in toolResult
  ) {
    return isSuccessfulHireAgentResult(toolResult.result);
  }

  if (
    'payload' in toolResult &&
    typeof toolResult.payload === 'object' &&
    toolResult.payload !== null &&
    'toolName' in toolResult.payload &&
    toolResult.payload.toolName === 'hireAgent' &&
    'result' in toolResult.payload
  ) {
    return isSuccessfulHireAgentResult(toolResult.payload.result);
  }

  return false;
}

async function validateHireAgentInput(
  capabilities: ReturnType<typeof createCapabilityStore>,
  functionId: string,
) {
  if (!functionId.trim()) {
    return {
      valid: false as const,
      error: 'The new agent must have a functionId.',
      hint: 'Pick an existing function with list_agent_functions or create one with create_agent_function before calling hireAgent.',
    };
  }

  const agentFunction = await capabilities.getFunction(functionId);

  if (!agentFunction) {
    return {
      valid: false as const,
      error: `Function ID "${functionId}" does not exist.`,
      hint: 'Use list_agent_functions to find a valid functionId, or create a new function and then call hireAgent again.',
    };
  }

  if (agentFunction.roles.length === 0) {
    return {
      valid: false as const,
      error: `Function "${agentFunction.name}" does not have any linked roles.`,
      hint: 'Use list_agent_roles to find or create a role, then use assign_role_to_function to link at least one role to this function before calling hireAgent again.',
    };
  }

  const roleToolPermissions = await Promise.all(
    agentFunction.roles.map(async (role) => ({
      roleId: role.roleId,
      roleName: role.name,
      toolIds: await capabilities.listRoleToolPermissions(role.roleId),
    })),
  );
  const grantedToolIds = new Set(roleToolPermissions.flatMap((role) => role.toolIds));
  const missingToolIds = REQUIRED_HIRING_TOOL_IDS.filter((toolId) => !grantedToolIds.has(toolId));

  if (missingToolIds.length > 0) {
    const roleSummary = roleToolPermissions
      .map((role) => `${role.roleName} (${role.roleId})`)
      .join(', ');

    return {
      valid: false as const,
      error: `Function "${agentFunction.name}" is missing the minimum base tools required for a hired agent.`,
      hint: `Add these tool permissions to at least one linked role with manage_role_tool_permissions: ${missingToolIds.join(', ')}. Current linked roles: ${roleSummary}.`,
    };
  }

  return {
    valid: true as const,
    functionDescription: agentFunction.description,
    functionId: agentFunction.functionId,
    functionName: agentFunction.name,
  };
}

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
      '4. **Role Validation**: Before finalizing, confirm the chosen function has at least one linked role.',
      '',
      '5. **Minimum Permissions**: Before finalizing, confirm the linked roles grant these minimum tools:',
      '   - list_conversations',
      '   - get_messages',
      '   - send_message',
      '   - list_agent_schedules',
      '   - create_agent_schedule',
      '   - update_agent_schedule',
      '   - delete_agent_schedule',
      '',
      'Use assign_role_to_function and manage_role_tool_permissions when those requirements are missing.',
      '',
      '6. **Report Progress**: After each major step, call reportHiringState to describe what you found and what you plan to do next.',
      '',
      '7. **Finalize Hiring**: Call hireAgent only after the function, roles, and minimum tool permissions are already valid.',
      '',
      '8. **Report Final Result**: Call reportHiringState to confirm the hiring was successful or describe any errors.',
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
      '- The selected function must already have at least one linked role before hireAgent is called.',
      '- The selected function must already grant the minimum base tools through its linked roles before hireAgent is called.',
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
          const validation = await validateHireAgentInput(capabilities, agent.functionId);

          if (!validation.valid) {
            console.log(`[HiringRH] hireAgent ERROR:`, validation.error);
            return validation;
          }

          const result = {
            ...agent,
            functionId: validation.functionId,
            functionName: validation.functionName,
            functionDescription: validation.functionDescription,
            valid: true,
          };
          console.log(`[HiringRH] hireAgent SUCCESS, returning:`, JSON.stringify(result, null, 2));
          return result;
        },
      }),
      ...tools,
    },
  });

  const hireAgentDisablerProcessor = new HireAgentDisablerProcessor();
  const mastra = new Mastra({
    agents: {
      [HIRING_RH_AGENT_ID]: agent,
    },
    gateways: {
      oauth: createOAuthGateway(),
    },
    processors: {
      [hireAgentDisablerProcessor.id]: hireAgentDisablerProcessor,
    },
  });
  const result = await mastra.getAgent(HIRING_RH_AGENT_ID)!.generate(hiringPrompt, {
    maxSteps: 20,
    toolChoice: 'auto',
  });

  const inputTokens = result.usage.inputTokens ?? 0;
  const outputTokens = result.usage.outputTokens ?? 0;
  const costUsd =
    (inputTokens / 1_000_000) * modelPrice.inputPerMillionUsd +
    (outputTokens / 1_000_000) * modelPrice.outputPerMillionUsd;

  console.log(`[HiringRH] generate() completed`);
  console.log(`[HiringRH] result.text:`, result.text);
  console.log(
    `[HiringRH] result.toolCalls:`,
    JSON.stringify(
      result.toolCalls.map((chunk) => ({ toolName: chunk.payload.toolName })),
      null,
      2,
    ),
  );
  console.log(
    `[HiringRH] result.toolResults:`,
    JSON.stringify(
      result.toolResults.map((chunk) => ({
        toolName: chunk.payload.toolName,
        hasResult: true,
      })),
      null,
      2,
    ),
  );

  // After hireAgent is called, the next step disables tools and returns text
  // Parse the text to extract the structured result
  const toolCall = result.toolCalls.find((chunk) => chunk.payload.toolName === 'hireAgent');
  const toolResult = result.toolResults.find((chunk) => chunk.payload.toolName === 'hireAgent');

  console.log(`[HiringRH] toolCall found:`, !!toolCall);
  console.log(`[HiringRH] toolResult found:`, !!toolResult);

  // If we have toolResult from hireAgent, use it
  if (toolResult) {
    console.log(
      `[HiringRH] toolResult.result:`,
      JSON.stringify(toolResult.payload.result, null, 2),
    );
    const parsedToolResult = hireAgentToolResultSchema.safeParse(toolResult.payload.result);

    if (parsedToolResult.success && parsedToolResult.data.valid) {
      console.log(
        `[HiringRH] SUCCESS - agentHired from toolResult:`,
        JSON.stringify(parsedToolResult.data, null, 2),
      );
      return {
        agentName: parsedToolResult.data.agentName,
        agentDescription: parsedToolResult.data.agentDescription,
        functionId: parsedToolResult.data.functionId,
        functionName: parsedToolResult.data.functionName,
        functionDescription: parsedToolResult.data.functionDescription,
        instructions: parsedToolResult.data.instructions,
        costUsd,
        modelKey: hiringRhModelKey,
        valid: true,
      };
    }

    if (parsedToolResult.success && !parsedToolResult.data.valid) {
      console.log(
        `[HiringRH] INVALID - hireAgent returned validation failure:`,
        JSON.stringify(parsedToolResult.data, null, 2),
      );
      return parsedToolResult.data;
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
    'Before calling hireAgent, make sure the chosen function exists, has at least one linked role, and that the linked roles grant the minimum base tools listed below.',
    `Minimum base tools: ${REQUIRED_HIRING_TOOL_IDS.join(', ')}.`,
    'If the function is missing roles or permissions, fix that first with assign_role_to_function and manage_role_tool_permissions.',
    'After designing the agent profile, you MUST call the tool "hireAgent" with the structured data to finalize the hiring.',
    'If hireAgent returns valid false, read the hint, fix the capability setup, and call hireAgent again only after the setup is valid.',
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
