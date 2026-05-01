import { randomUUID } from 'node:crypto';
import { forgeDebug } from '@forge-runtime/core';
import { eq } from 'drizzle-orm';

import type { Database } from '../database/index';
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

async function executeHireAgentTool(input: {
  tool: Tool;
  toolInput: unknown;
}) {
  return input.tool.execute(input.toolInput, {
    runtimeId: HIRING_RH_AGENT_ID,
    stepId: randomUUID(),
    stepNumber: 0,
    toolCallId: randomUUID(),
  });
}

function getLastAssistantText(messages: NativeToolLoopMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];

    if (!message || message.role !== 'assistant') {
      continue;
    }

    if (typeof message.content === 'string') {
      return message.content;
    }

    if (!Array.isArray(message.content)) {
      continue;
    }

    return message.content
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('');
  }

  return '';
}

function buildStepDiagnostics(messages: NativeToolLoopMessage[]) {
  return messages
    .map((message) => {
      if (message.role === 'assistant' && Array.isArray(message.content)) {
        return {
          role: message.role,
          content: message.content.map((part) => {
            if (part.type === 'tool-call') {
              return {
                type: part.type,
                toolName: part.toolName,
                input: part.input,
              };
            }

            if (part.type === 'text') {
              return {
                type: part.type,
                text: part.text,
              };
            }
          }),
        };
      }

      if (message.role === 'tool' && Array.isArray(message.content)) {
        return {
          role: message.role,
          content: message.content.map((part) => ({
            type: part.type,
            toolName: 'toolName' in part ? part.toolName : undefined,
            output: 'output' in part ? part.output : undefined,
          })),
        };
      }

      return {
        role: message.role,
      };
    });
}

function isToolResultWithOutput(value: unknown): value is {
  output: unknown;
} {
  return (
    typeof value === 'object'
    && value !== null
    && 'output' in value
  );
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

    forgeDebug({ scope: 'hiring-rh', level: 'info', message: 'Tools loaded', context: { toolCount: Object.keys(tools).length } });

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
      execute: async ({ status }) => {
        try {
            forgeDebug({ scope: 'hiring-rh', level: 'info', message: 'Agent status report', context: { status } });
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
            forgeDebug({ scope: 'hiring-rh', level: 'debug', message: 'hireAgent called', context: { agentName: agent.agentName } });
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
                forgeDebug({ scope: 'hiring-rh', level: 'error', message: 'hireAgent validation error', context: { error: validation.error } });
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
            forgeDebug({ scope: 'hiring-rh', level: 'info', message: 'hireAgent success', context: { agentName: result.agentName, roleName: result.roleName } });
          return result;
        } catch (error) {
            forgeDebug({ scope: 'hiring-rh', level: 'error', message: 'hireAgent failure', context: { error: error instanceof Error ? error.message : String(error) } });
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
  const lastRunText = runResult.text;
  const lastRunFinishReason = runResult.finishReason;
  const hireAgentActionResult = (
    runResult.deferredToolCall
    && runResult.deferredToolCall.toolName === 'hireAgent'
  )
    ? await executeHireAgentTool({
      tool: hiringTools.hireAgent,
      toolInput: runResult.deferredToolCall.input,
    })
    : null;

  const costUsd =
    (inputTokens / 1_000_000) * modelPrice.inputPerMillionUsd +
    (outputTokens / 1_000_000) * modelPrice.outputPerMillionUsd;

  forgeDebug({ scope: 'hiring-rh', level: 'debug', message: 'generateText completed' });
  forgeDebug({ scope: 'hiring-rh', level: 'debug', message: 'response messages', context: { messages: buildStepDiagnostics(messages) } });

  if (hireAgentActionResult) {
    const toolOutput = isToolResultWithOutput(hireAgentActionResult)
      ? hireAgentActionResult.output
      : hireAgentActionResult;
    forgeDebug({ scope: 'hiring-rh', level: 'debug', message: 'hireAgent action result', context: { hasOutput: !!toolOutput } });
    const parsedToolResult = hireAgentToolResultSchema.safeParse(toolOutput);

    if (!parsedToolResult.success) {
      forgeDebug({ scope: 'hiring-rh', level: 'error', message: 'hireAgent tool result failed schema validation', context: { parseError: parsedToolResult.error.flatten() } });
    }

    if (parsedToolResult.success && parsedToolResult.data.valid) {
      forgeDebug({ scope: 'hiring-rh', level: 'info', message: 'agentHired from toolResult', context: { agentName: parsedToolResult.data.agentName } });
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
      forgeDebug({ scope: 'hiring-rh', level: 'warn', message: 'hireAgent returned validation failure', context: { error: parsedToolResult.data.error, hint: parsedToolResult.data.hint } });
      return parsedToolResult.data;
    }
  }

  forgeDebug({ scope: 'hiring-rh', level: 'error', message: 'Could not extract hiring data from response' });
  forgeDebug({ scope: 'hiring-rh', level: 'error', message: 'Error details', context: { finishReason: lastRunFinishReason } });
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
    'Minimum base tools: list_contacts, upsert_contact, list_conversations, get_messages, send_message, change_chat_group, list_agent_notifications, publish_skill_to_catalog, list_self_crons, manage_self_crons.',
    'If the role is missing capabilities, fix that first with manage_role_capabilities.',
    'After designing the agent profile, you MUST call the tool "hireAgent" with the structured data to finalize the hiring.',
    'If hireAgent returns valid false, read the hint, fix the capability setup, and call hireAgent again only after the setup is valid.',
    'Do not finish in plain text before hireAgent returns valid true.',
    'This workflow is not complete until there is a successful hireAgent tool result.',
    'The hireAgent tool requires an object with: agentName, agentDescription, roleId, primaryGoal, secondaryGoals, backstory.',
    'secondaryGoals must be an array of short goal strings.',
    'The name must be fictional, unique, and a single name only. Do not use a common human first name, a full person name, or a multi-word name.',
    'Use a name that feels like a proper identity for a professional agent, without jokes, mascots, or caricature framing.',
    'The new name must not duplicate or closely resemble the name of any existing internal collaborator.',
    'The professional profile, backstory, and goals must be grounded in the real-world role and how that role operates in practice.',
    'Write the prompt with exactly these sections and no others: Primary Goal, Secondary Goals, Backstory.',
    'Keep the structure simple and direct, in a CrewAI-like style.',
    'Do not add sections about tools, safety rules, constraints, communication style, execution control, or environment disclaimers.',
    'Do not mention tool ids, workflow ids, or capability ids anywhere in the generated agent text.',
    'Do not turn the backstory into fiction, lore, or theatrical character writing.',
    'Make it explicit in the generated text that the collaborator is operating in a real company through software, not in a simulation, game, or roleplay.',
    'Use the backstory to give realistic vocational context to the agent, like a concise professional biography.',
    'Keep the text descriptive and role-oriented, closer to a real-world role profile than to an operational handbook.',
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
