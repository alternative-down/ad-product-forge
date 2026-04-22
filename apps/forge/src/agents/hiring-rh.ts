import { eq } from 'drizzle-orm';

import type { Database } from '../database/index';
import { llmModelPrices } from '../database/schema';
import { createCompanyCashLedger } from '../finance/company-cash-ledger';
import { createLlmSettingsStore } from '../llm/settings-store';
import { resolveProfileRuntimeModel } from '../llm/runtime-model';
import {
  AiSdkStepModelAdapter,
  RuntimeRunController,
  createDefaultContextFormatter,
  createRuntimeHost,
  createTextStepContextEntry,
  createTool,
  toolsToRuntimeActions,
} from '@forge-runtime/core';
import { z } from 'zod';
import { createCapabilityTools } from '../capabilities/tools';
import type { AgentLoaderConfig } from './agent-loader';
import { createCapabilityStore } from '../capabilities/store';
import { forgeCustomToolIds } from '../capabilities/catalog';
import { createSystemSettingsStore } from '../system-settings/store';

const HIRING_RH_AGENT_ID = 'internal-hiring-rh';
const HIRING_RH_TOOL_IDS = new Set([
  'list_agent_roles',
  'manage_agent_role',
  'change_agent_role',
  'list_role_capabilities',
  'manage_role_capabilities',
] as const);
const generatedAgentProfileSchema = z.object({
  agentName: z.string().min(1),
  agentDescription: z.string().min(1),
  roleId: z.string().min(1),
  primaryGoal: z.string().min(1),
  secondaryGoals: z.array(z.string().min(1)).min(1),
  backstory: z.string().min(1),
});
const hiringRhResultSchema = generatedAgentProfileSchema.extend({
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
type HiringActionResult = {
  name: string;
  output: unknown;
};
type HiringStepRecord = {
  stepNumber: number;
  continuation: string;
  modelUsage: {
    inputTokens?: number;
    outputTokens?: number;
  } | null;
  modelResponse: {
    segments: unknown[];
  };
  actionResults: HiringActionResult[];
};

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

function hasHireAgentActionResult(actionResult: { name: string }) {
  return actionResult.name === 'hireAgent';
}

function normalizeAgentName(value: string) {
  return value.trim().toLowerCase();
}

function validateGeneratedAgentProfile(profile: z.infer<typeof generatedAgentProfileSchema>) {
  const mentionedToolIds = forgeCustomToolIds.filter((toolId) =>
    profile.primaryGoal.includes(toolId)
    || profile.secondaryGoals.some((goal) => goal.includes(toolId))
    || profile.backstory.includes(toolId),
  );

  if (mentionedToolIds.length > 0) {
    return {
      valid: false as const,
      error: 'The generated agent profile must not mention tool ids directly.',
      hint: `Remove direct tool mentions from the generated profile, including: ${mentionedToolIds.join(', ')}.`,
    };
  }

  return {
    valid: true as const,
  };
}

function buildGeneratedAgentInstructions(profile: z.infer<typeof generatedAgentProfileSchema>) {
  return [
    'Primary Goal:',
    profile.primaryGoal.trim(),
    '',
    'Secondary Goals:',
    ...profile.secondaryGoals.map((goal) => `- ${goal.trim()}`),
    '',
    'Backstory:',
    profile.backstory.trim(),
  ].join('\n');
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
    agent: generatedAgentProfileSchema,
  });

  // NOTE: inputSchema kept for reference but we now use toolResults instead of args

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
      '4. **Role Creation Rule**: When you create a new role with manage_agent_role, the platform already provisions the minimum base tools automatically.',
      '',
      '5. **Report Progress**: After each major step, call reportHiringState to describe what you found and what you plan to do next.',
      '',
      '6. **Finalize Hiring**: Call hireAgent only after the role selection is correct and the generated profile is valid.',
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
      '- Newly created roles already receive the minimum base tools automatically.',
      '- Generated agent prompts should feel professionally written, not templated.',
      '- Do NOT include tool ids, workflow ids, tool descriptions, environment-control instructions, or platform mechanics in the generated agent text.',
      '- Do NOT name internal functions such as list_conversations, send_message, manage_crons, or any other capability id in the agent text.',
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
      '[Full system prompt with Primary Goal, Secondary Goals, and Backstory sections]',
    ].join('\n');
  const hiringTools = {
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
          const currentAgents = await db.query.agents.findMany({
            columns: {
              name: true,
            },
          });
          const normalizedAgentName = normalizeAgentName(agent.agentName);

          if (currentAgents.some((currentAgent) => normalizeAgentName(currentAgent.name) === normalizedAgentName)) {
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
            console.log(`[HiringRH] hireAgent ERROR:`, validation.error);
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
  };
  const defaultFormatter = createDefaultContextFormatter();
  const host = createRuntimeHost({
    runtime: {
      runtimeId: HIRING_RH_AGENT_ID,
      model: new AiSdkStepModelAdapter({
        model: hiringRhRuntimeModel,
        system: systemPrompt,
      }),
      contextFormatter: {
        formatInput(runtimeInput: {
          id: string;
          type: string;
          payload: unknown;
        }) {
          return createTextStepContextEntry({
            id: runtimeInput.id,
            kind: `input:${runtimeInput.type}`,
            title: 'Hiring Request',
            text: typeof runtimeInput.payload === 'string'
              ? runtimeInput.payload
              : JSON.stringify(runtimeInput.payload, null, 2),
          });
        },
        formatActionResults: defaultFormatter.formatActionResults,
      },
    },
    actions: toolsToRuntimeActions(hiringTools),
  });
  await host.runtime.dispatch({
    id: `hiring-request:${Date.now()}`,
    type: 'hiring-request',
    payload: hiringPrompt,
  });
  const runController = new RuntimeRunController({
    runtime: host.runtime,
  });
  const runResult = await runController.run({
    maxSteps: 100,
    continueAfterStep({ latestStep }: { latestStep: HiringStepRecord }) {
      if (latestStep.actionResults.some((actionResult: HiringActionResult) => hasHireAgentActionResult(actionResult))) {
        return false;
      }

      return latestStep.actionResults.length > 0;
    },
  });
  const usage = runResult.steps.reduce((totals: { inputTokens: number; outputTokens: number }, step: HiringStepRecord) => {
    return {
      inputTokens: totals.inputTokens + (step.modelUsage?.inputTokens ?? 0),
      outputTokens: totals.outputTokens + (step.modelUsage?.outputTokens ?? 0),
    };
  }, {
    inputTokens: 0,
    outputTokens: 0,
  });
  const inputTokens = usage.inputTokens;
  const outputTokens = usage.outputTokens;
  const costUsd =
    (inputTokens / 1_000_000) * modelPrice.inputPerMillionUsd +
    (outputTokens / 1_000_000) * modelPrice.outputPerMillionUsd;

  console.log(`[HiringRH] run completed`);
  console.log(
    `[HiringRH] action results:`,
    JSON.stringify(
      runResult.steps.flatMap((step: HiringStepRecord) => step.actionResults.map((actionResult: HiringActionResult) => ({
        actionName: actionResult.name,
        output: actionResult.output,
      }))),
      null,
      2,
    ),
  );
  const hireAgentActionResult = runResult.steps
    .flatMap((step: HiringStepRecord) => step.actionResults)
    .find((actionResult: HiringActionResult) => actionResult.name === 'hireAgent');

  if (hireAgentActionResult) {
    console.log(
      `[HiringRH] hireAgent action result:`,
      JSON.stringify(hireAgentActionResult.output, null, 2),
    );
    const parsedToolResult = hireAgentToolResultSchema.safeParse(hireAgentActionResult.output);

    if (!parsedToolResult.success) {
      console.log(
        '[HiringRH] ERROR: hireAgent tool result failed schema validation',
        JSON.stringify(parsedToolResult.error.flatten(), null, 2),
      );
    }

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
  console.log(
    '[HiringRH] ERROR DETAILS:',
    JSON.stringify(
      {
        steps: runResult.steps.map((step: HiringStepRecord) => ({
          stepNumber: step.stepNumber,
          continuation: step.continuation,
          segments: step.modelResponse.segments,
          actionResults: step.actionResults,
        })),
      },
      null,
      2,
    ),
  );
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
    'The name must be fictional, unique, and a single name only. Do not use a common human first name, a full person name, or a multi-word name.',
    'Use a name that feels like a proper identity for a professional agent, without jokes, mascots, or caricature framing.',
    'The new name must not duplicate or closely resemble the name of any existing internal collaborator.',
    'The professional profile, backstory, and goals must be grounded in the real-world role and how that role operates in practice.',
    'Write the prompt with exactly these sections and no others: Primary Goal, Secondary Goals, Backstory.',
    'Keep the structure simple and direct, in a CrewAI-like style.',
    'Do not turn the backstory into fiction, lore, or theatrical character writing.',
    'Make it explicit in the generated text that the collaborator is operating in a real company through software, not in a simulation, game, or roleplay.',
    'Use the backstory to give realistic vocational context to the agent, like a concise professional biography.',
    'Keep the text descriptive and role-oriented, closer to a real-world role profile than to an operational handbook.',
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
