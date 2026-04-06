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
import { AGENT_BASE_TOOL_IDS } from './base-tool-ids';

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
  'list_agent_roles',
  'manage_agent_role',
  'change_agent_role',
  'list_role_capabilities',
  'manage_role_capabilities',
] as const);
const REQUIRED_HIRING_TOOL_IDS = AGENT_BASE_TOOL_IDS;
const hiringRhResultSchema = z.object({
  agentName: z.string().min(1),
  agentDescription: z.string().min(1),
  roleId: z.string().min(1),
  instructions: z.string().min(1),
});
const hireAgentSuccessSchema = hiringRhResultSchema.extend({
  valid: z.literal(true),
  roleName: z.string().min(1),
  roleDescription: z.string().optional(),
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
      roleId: string;
      instructions: string;
      roleName: string;
      roleDescription: string | undefined;
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
  roleId: string,
) {
  if (!roleId.trim()) {
    return {
      valid: false as const,
      error: 'The new agent must have a roleId.',
      hint: 'Pick an existing role with list_agent_roles or create one with manage_agent_role before calling hireAgent.',
    };
  }

  const agentRole = await capabilities.getRole(roleId);

  if (!agentRole) {
    return {
      valid: false as const,
      error: `Role ID "${roleId}" does not exist.`,
      hint: 'Use list_agent_roles to find a valid roleId, or create a new role and then call hireAgent again.',
    };
  }

  const grantedToolIds = new Set(await capabilities.listRoleToolPermissions(agentRole.roleId));
  const missingToolIds = REQUIRED_HIRING_TOOL_IDS.filter((toolId) => !grantedToolIds.has(toolId));

  if (missingToolIds.length > 0) {
    return {
      valid: false as const,
      error: `Role "${agentRole.name}" is missing the minimum base tools required for a hired agent.`,
      hint: `Add these capabilities to the role with manage_role_capabilities: ${missingToolIds.join(', ')}.`,
    };
  }

  return {
    valid: true as const,
    roleDescription: agentRole.description,
    roleId: agentRole.roleId,
    roleName: agentRole.name,
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
  const existingRoles = await db.query.agentRoles.findMany();
  const existingRoleNamesById = new Map(existingRoles.map((role) => [role.id, role.name]));
  const existingAgents = await db.query.agents.findMany({
    columns: {
      name: true,
      roleId: true,
    },
    orderBy: (fields, { asc }) => [asc(fields.name)],
  });
  const modelPrice = await db.query.llmModelPrices.findFirst({
    where: eq(llmModelPrices.modelKey, hiringRhModelKey),
  });
  const hiringPrompt = buildHiringPrompt({
    ...input,
    companyName: companySettings.companyName,
    companyContext: companySettings.companyContext,
    existingAgents: existingAgents.map((agent) => ({
      name: agent.name,
      roleName: agent.roleId ? (existingRoleNamesById.get(agent.roleId) ?? null) : null,
    })),
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
      '- What you currently see (roles and capabilities)',
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
      '2. **Inspect First**: Use capability management tools to explore existing roles, current role capabilities, and available capabilities.',
      '',
      '3. **Role Selection**: Reuse an existing role when it matches the hiring request. Create or update a new role only when no existing role fits.',
      '',
      '4. **Minimum Permissions**: Before finalizing, confirm the chosen role grants these minimum tools:',
      '   - list_conversations',
      '   - get_messages',
      '   - send_message',
      '   - list_self_crons',
      '   - manage_self_crons',
      '',
      'Use manage_role_capabilities when those requirements are missing.',
      '',
      '5. **Report Progress**: After each major step, call reportHiringState to describe what you found and what you plan to do next.',
      '',
      '6. **Finalize Hiring**: Call hireAgent only after the role and minimum tool permissions are already valid.',
      '',
      '7. **Report Final Result**: Call reportHiringState to confirm the hiring was successful or describe any errors.',
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
      '- Write 2-3 paragraphs grounded in the real-world professional background of the role.',
      '- Focus on: domain knowledge, relevant experience, operating discipline, standards, and how the role approaches problems in practice.',
      '- AVOID: fictional worlds, character lore, whimsical archetypes, mascots, jokes, or cartoon framing.',
      '- The backstory must read like a serious professional profile for the real role being hired.',
      '- Example: "With years of experience building operational systems for product teams, you know how to turn ambiguous requests into scoped execution plans, coordinate dependencies, and keep delivery moving while maintaining technical quality..."',
      '',
      '### Instructions',
      '- Practical day-to-day operating guidance.',
      '- Focus on HOW to accomplish tasks: decision frameworks, priorities, communication patterns.',
      '- Include any specific tools or workflows this agent should use.',
      '- Do NOT include: tool descriptions, safety rules, execution control, environment behavior (handled elsewhere).',
      '',
      '## Important Constraints',
      '',
      '- Use "role" terminology consistently.',
      '- The roleId must be a real internal role id from the capability store.',
      '- The agent name must be fictional, unique, and a single name only.',
      '- Do not use a common human first name, full person name, title + name, nickname + surname, or multi-word name.',
      '- The name should feel like a proper identity, not a joke, not a mascot label, and not a generic placeholder.',
      '- Everything except the name must stay grounded in the real professional role and real operating context of the work.',
      '- The selected role must already grant the minimum base tools before hireAgent is called.',
      '- Generated agent prompts should feel professionally written, not templated.',
      '- Each agent should be able to COMPLETE TASKS AUTONOMOUSLY with clear object and completion criteria.',
      '',
      '## Output Structure',
      '',
      'Return the agent profile in this format:',
      '',
      'Agent Name: [name]',
      'Agent Description: [1-2 sentence description]',
      'Role ID: [internal role id]',
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
          try {
            console.log(`[HiringRH] Agent status report:`, status);
            return { valid: true, logged: status };
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
              valid: false,
              error: message,
              hint: 'Try again in a moment. If the problem persists, report the same status in plain text.',
            };
          }
        },
      }),
      hireAgent: createTool({
        id: 'hireAgent',
        description: 'Realiza contratação do agente e finaliza o processo',
        inputSchema,
        execute: async ({ agent }) => {
          try {
            console.log(`[HiringRH] hireAgent called with:`, JSON.stringify(agent, null, 2));
            const validation = await validateHireAgentInput(capabilities, agent.roleId);

            if (!validation.valid) {
              console.log(`[HiringRH] hireAgent ERROR:`, validation.error);
              return validation;
            }

            const result = {
              ...agent,
              roleId: validation.roleId,
              roleName: validation.roleName,
              roleDescription: validation.roleDescription,
              valid: true,
            };
            console.log(`[HiringRH] hireAgent SUCCESS, returning:`, JSON.stringify(result, null, 2));
            return result;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.log(`[HiringRH] hireAgent FAILURE:`, message);
            return {
              valid: false,
              error: message,
              hint: 'Verify the selected role and its permissions, then try again.',
            };
          }
        },
      }),
      ...tools,
    },
    inputProcessors: [new HireAgentDisablerProcessor()],
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
        roleId: parsedToolResult.data.roleId,
        roleName: parsedToolResult.data.roleName,
        roleDescription: parsedToolResult.data.roleDescription,
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
  existingAgents: Array<{
    name: string;
    roleName: string | null;
  }>;
}) {
  const sections = [
    'Design one newly hired permanent internal collaborator from the hiring request.',
    `Hiring request:\n${input.hiringRequest.trim()}`,
    'Inspect the current capability structure with tools before deciding whether to reuse or change roles.',
    'Before calling hireAgent, make sure the chosen role exists and grants the minimum base tools listed below.',
    `Minimum base tools: ${REQUIRED_HIRING_TOOL_IDS.join(', ')}.`,
    'If the role is missing capabilities, fix that first with manage_role_capabilities.',
    'After designing the agent profile, you MUST call the tool "hireAgent" with the structured data to finalize the hiring.',
    'If hireAgent returns valid false, read the hint, fix the capability setup, and call hireAgent again only after the setup is valid.',
    'The hireAgent tool requires an object with: agentName, agentDescription, roleId, instructions.',
    'The name must be fictional, unique, and a single name only. Do not use a common human first name, a full person name, or a multi-word name.',
    'Use a name that feels like a proper identity for a professional agent, without jokes, mascots, or caricature framing.',
    'The new name must not duplicate or closely resemble the name of any existing internal collaborator.',
    'The professional profile, backstory, goals, and instructions must be grounded in the real-world role and how that role operates in practice.',
    'Write the prompt with exactly these sections and no others: Name, Primary Goal, Secondary Goals, Backstory, Instructions.',
    'Keep the structure simple and direct, in a CrewAI-like style.',
    'Do not add sections about tools, safety rules, constraints, communication style, execution control, or environment disclaimers.',
    'Do not turn the backstory into fiction, lore, or theatrical character writing.',
    'Put the practical operating guidance into Instructions.',
    'The collaborator works inside the company and primarily communicates through internal-chat.',
  ];

  if (input.existingAgents.length > 0) {
    sections.push(
      [
        'Existing internal collaborators:',
        ...input.existingAgents.map((agent) => `- ${agent.name} — ${agent.roleName ?? 'Sem função definida'}`),
        'Avoid duplicate names and avoid names that look too similar to the existing ones.',
      ].join('\n'),
    );
  }

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
