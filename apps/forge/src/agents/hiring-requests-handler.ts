import { forgeDebug } from '@forge-runtime/core';
import { eq } from 'drizzle-orm';


import type {Database} from '../database/schema';
import { llmModelPrices } from '../database/schema';
import { createCompanyCashLedger } from '../finance/company-cash-ledger';
import { createLlmSettingsStore } from '../llm/settings-store';
import { resolveProfileRuntimeModel } from '../llm/runtime-model';
import {
  createTool,
  runNativeToolLoop,
  type NativeToolLoopMessage,
  type Tool,
} from '@forge-runtime/core';
import { z } from 'zod';
import { createCapabilityTools } from '../capabilities/tools';
import type { AgentLoaderConfig } from './agent-loader';
import { createCapabilityStore } from '../capabilities/store';
import { createSystemSettingsStore } from '../system-settings/store';
import type { RuntimeProfile } from '../llm/runtime-model';

import {
  normalizeAgentName,
  validateGeneratedAgentProfile,
  isToolResultWithOutput,
  validateHireAgentInput,
} from './hiring-validators';
import { buildHiringPrompt, estimateTextTokens } from './hiring-prompt';

const HIRING_RH_AGENT_ID = 'internal-hiring-rh';
const HIRING_RH_TOOL_IDS = new Set([
  'list_agent_roles',
  'manage_agent_role',
  'change_agent_role',
  'list_role_capabilities',
  'manage_role_capabilities',
] as const);
export const generatedAgentProfileSchema = z.object({
  agentName: z.string().min(1),
  agentDescription: z.string().min(1),
  roleId: z.string().min(1),
  primaryGoal: z.string().min(1),
  secondaryGoals: z.array(z.string().min(1)).min(1),
  backstory: z.string().min(1),
});
export const hiringRhResultSchema = generatedAgentProfileSchema.extend({
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
      costUsd?: number;
      modelKey?: string;
      roleName?: string;
      roleDescription?: string;
    };

// ─── helpers ───────────────────────────────────────────────────────────────────

async function executeHireAgentTool(input: {
  tool: Tool;
  toolInput: unknown;
  db: Database;
  capabilities: ReturnType<typeof createCapabilityStore>;
}) {
  const { tool, toolInput } = input;
  // execute is typed; call with the right input shape
   
  const result = await (tool.execute as (arg: unknown) => Promise<unknown>)(toolInput);
  return result;
}

function _getLastAssistantText(messages: NativeToolLoopMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'assistant' && msg.content !== null && msg.content !== undefined && typeof msg.content === 'string') {
      return msg.content;
    }
  }
  return null;
}

function buildStepDiagnostics(messages: NativeToolLoopMessage[]) {
  return messages.map((msg, i) => ({
    index: i,
    role: msg.role,
    hasToolCalls: msg.role === 'assistant' && Array.isArray((msg as unknown as { tool_calls?: unknown[] }).tool_calls) && ((msg as unknown as { tool_calls: unknown[] }).tool_calls).length > 0,
    textLength: typeof msg.content === 'string' ? msg.content.length : 0,
  }));
}

function buildGeneratedAgentInstructions(profile: z.infer<typeof generatedAgentProfileSchema>) {
  const sections = [
    `# ${profile.agentName}`,
    ``,
    `## Primary Goal`,
    profile.primaryGoal,
    ``,
    `## Secondary Goals`,
    ...profile.secondaryGoals.map((goal, i) => `${i + 1}. ${goal}`),
    ``,
    `## Backstory`,
    profile.backstory,
  ];
  return sections.join('\n');
}

// ─── main export ───────────────────────────────────────────────────────────────

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
  const hiringRhRuntimeModel = await resolveProfileRuntimeModel(defaults.hiringRhProfile as RuntimeProfile);
  const companySettings = await systemSettings.getSettings();
  const hiringRhModelKey = (defaults.hiringRhProfile as RuntimeProfile).modelKey;
  const companyCash = createCompanyCashLedger(db);
  const existingRoles = await db.query.agentRoles.findMany();
  const existingRoleNamesById = new Map(existingRoles.map((role) => [String((role as { id: unknown }).id), String((role as { name: unknown }).name)]));
  const existingAgents = await db.query.agents.findMany({
    columns: {
      name: true as never,
      roleId: true as never,
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
    existingAgents: existingAgents.map((agent: object) => ({
      name: (agent as { name: unknown }).name as string,
      roleName: (agent as { roleId: unknown }).roleId !== null && (agent as { roleId: unknown }).roleId !== undefined ? (existingRoleNamesById.get(String((agent as { roleId: unknown }).roleId)) ?? null) : null,
    })),
  });

  if (!modelPrice) {
    forgeDebug({ scope: 'hiring-requests-handler', level: 'error', message: 'hiring-requests-handler: validation/requirement failed' });
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

  forgeDebug({ scope: 'hiring-requests-handler', level: 'info', message: 'Tools loaded', context: { toolCount: Object.keys(tools).length } });

  if (currentBalanceUsd < estimatedCostUsd) {
    throw new Error('Insufficient company cash for hiring workflow');
  }

  const inputSchema = z.object({
    agent: generatedAgentProfileSchema,
  });

  const systemPrompt = [
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
      '- Write 2-3 paragraphs as a realistic professional backstory for the agent.',
      '- It does not need to be specifically about the current company. It should read like a small biography grounded in the real-world vocational context of the role.',
      '- Focus on: domain knowledge, relevant experience, vocational history, operating discipline, standards, and how the role approaches problems in practice.',
      '- AVOID: fictional worlds, character lore, whimsical archetypes, mascots, jokes, or cartoon framing.',
      '- The backstory must read like a serious professional profile for a real-world role, even if the agent identity is fictional.',
      '- Example: "With years of experience building operational systems for product teams, you know how to turn ambiguous requests into scoped execution plans, coordinate dependencies, and keep delivery moving while maintaining technical quality..."',
      '',
      '## Important Constraints',
      '',
      '- Use "role" terminology consistently.',
      '- The roleId must be a real internal role id from the capability store.',
      '- The agent name must be fictional, unique, and a single name only.',
      '- Do not use a common human first name, full person name, title + name, nickname + surname, or multi-word name.',
      '- The name should feel like a proper identity, not a joke, not a mascot label, and not a generic placeholder.',
      '- Everything except the name must stay grounded in the real professional role and real operating context of the work.',
      '- The generated text should read more like a real-world professional role profile than an operational instruction manual.',
      '- The selected role must already grant the minimum base tools before hireAgent is called.',
      '- Generated agent prompts should feel professionally written, not templated.',
      '- Do NOT include tool ids, workflow ids, tool descriptions, environment-control instructions, or platform mechanics in the generated agent text.',
      '- Do NOT name internal functions such as list_conversations, send_message, manage_crons, or any other capability id in the agent text.',
      '',
    ].join('\n');
  const hiringTools = {
    reportHiringState: createTool({
      id: 'reportHiringState',
      description: 'Use this tool to report what you see, what tools are available, and any difficulties you encounter during the hiring process. This helps with debugging.',
      inputSchema: z.object({
        status: z.string().describe('Describe what you currently see, what tools you have access to, what you are trying to do, and any issues or difficulties.'),
      }),
      execute: ({ status }) => {
        try {
          forgeDebug({ scope: 'hiring-requests-handler', level: 'info', message: 'Agent status report', context: { status } });
          return { valid: true, logged: status };
        } catch (error) {
          return {
            valid: false,
            error: error instanceof Error ? error.message : String(error),
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
          forgeDebug({ scope: 'hiring-requests-handler', level: 'debug', message: 'hireAgent called', context: { agentName: agent.agentName } });
          const currentAgents = await db.query.agents.findMany({
            columns: {
              name: true,
            },
          });
          const normalizedAgentName = normalizeAgentName(agent.agentName);

          if (currentAgents.some((currentAgent: object) => normalizeAgentName((currentAgent as { name: unknown }).name as string) === normalizedAgentName)) {
            return {
              valid: false,
              error: `An internal collaborator named "${agent.agentName}" already exists.`,
              hint: 'Choose a different fictional single-word name that does not duplicate an existing collaborator.',
            };
          }

          const profileValidation = validateGeneratedAgentProfile(agent);

          if (!profileValidation.valid) {
            return {
              valid: false,
              error: profileValidation.error,
              hint: profileValidation.hint,
            };
          }

          const validation = await validateHireAgentInput(capabilities, agent.roleId);

          if (!validation.valid) {
            forgeDebug({ scope: 'hiring-requests-handler', level: 'error', message: 'hireAgent validation error', context: { error: validation.error } });
            return validation;
          }

          const result = {
            ...agent,
            instructions: buildGeneratedAgentInstructions(agent),
            roleId: validation.roleId,
            roleName: validation.roleName,
            roleDescription: validation.roleDescription,
            valid: true,
          };
          forgeDebug({ scope: 'hiring-requests-handler', level: 'info', message: 'hireAgent success', context: { agentName: result.agentName, roleName: result.roleName } });
          return result;
        } catch (error) {
          forgeDebug({ scope: 'hiring-requests-handler', level: 'error', message: 'hireAgent failure', context: { error: error instanceof Error ? error.message : String(error) } });
          return {
            valid: false,
            error: error instanceof Error ? error.message : String(error),
            hint: 'Verify the selected role and its permissions, then try again.',
          };
        }
      },
    }),
    ...tools,
  };
  const runResult = await runNativeToolLoop({
    model: hiringRhRuntimeModel,
    system: systemPrompt,
    prompt: hiringPrompt,
    tools: hiringTools,
    deferredToolNames: ['hireAgent'],
    maxRounds: 100,
    maxStepsPerRound: 20,
    runtimeId: HIRING_RH_AGENT_ID,
  });
  const messages = runResult.messages;
  const inputTokens = runResult.usage.inputTokens;
  const outputTokens = runResult.usage.outputTokens;
  const _lastRunText = runResult.text;
  const lastRunFinishReason = runResult.finishReason;
  const hireAgentActionResult = (
    runResult.deferredToolCall
    && runResult.deferredToolCall.toolName === 'hireAgent'
  )
    ? await executeHireAgentTool({
      tool: hiringTools.hireAgent,
      toolInput: runResult.deferredToolCall.input,
      db,
      capabilities,
    })
    : null;

  const costUsd =
    (inputTokens / 1_000_000) * modelPrice.inputPerMillionUsd +
    (outputTokens / 1_000_000) * modelPrice.outputPerMillionUsd;

  forgeDebug({ scope: 'hiring-requests-handler', level: 'debug', message: 'generateText completed' });
  forgeDebug({ scope: 'hiring-requests-handler', level: 'debug', message: 'response messages', context: { messages: buildStepDiagnostics(messages) } });

  if (hireAgentActionResult !== null && hireAgentActionResult !== undefined) {
    const toolOutput = isToolResultWithOutput(hireAgentActionResult)
      ? hireAgentActionResult.output
      : hireAgentActionResult;
    forgeDebug({ scope: 'hiring-requests-handler', level: 'debug', message: 'hireAgent action result', context: { hasOutput: toolOutput !== null && toolOutput !== undefined } });
    const parsedToolResult = hireAgentToolResultSchema.safeParse(toolOutput);

    if (!parsedToolResult.success) {
      forgeDebug({ scope: 'hiring-requests-handler', level: 'error', message: 'hireAgent tool result failed schema validation', context: { parseError: parsedToolResult.error.flatten() } });
    }

    if (parsedToolResult.success && parsedToolResult.data.valid) {
      forgeDebug({ scope: 'hiring-requests-handler', level: 'info', message: 'agentHired from toolResult', context: { agentName: parsedToolResult.data.agentName } });
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
      forgeDebug({ scope: 'hiring-requests-handler', level: 'warn', message: 'hireAgent returned validation failure', context: { error: parsedToolResult.data.error, hint: parsedToolResult.data.hint } });
      return parsedToolResult.data;
    }
  }

  forgeDebug({ scope: 'hiring-requests-handler', level: 'error', message: 'Could not extract hiring data from response' });
  forgeDebug({ scope: 'hiring-requests-handler', level: 'error', message: 'Error details', context: { finishReason: lastRunFinishReason } });
  return {
    error: 'Hiring process did not return valid agent data. Please try again.',
    valid: false,
  };
}