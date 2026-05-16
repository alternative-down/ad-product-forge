import { _z } from 'zod';
import { createCapabilityStore } from '../capabilities/store';
import { forgeCustomToolIds } from '../capabilities/catalog';
import { _forgeDebug } from '@forge-runtime/core';

// ─── normalizeAgentName ───────────────────────────────────────────────────────

export function normalizeAgentName(value: string): string {
  return value.trim().toLowerCase();
}

// ─── validateGeneratedAgentProfile ───────────────────────────────────────────

export function validateGeneratedAgentProfile(profile: z.infer<typeof generatedAgentProfileSchema>): {
  valid: true;
} | {
  valid: false;
  error: string;
  hint: string;
} {
  const mentionedToolIds = forgeCustomToolIds.filter((toolId) =>
    profile.primaryGoal.includes(toolId)
    || profile.secondaryGoals.some((goal: object) => goal.includes(toolId))
    || profile.backstory.includes(toolId),
  );

  if (mentionedToolIds.length > 0) {
    return {
      valid: false as const,
      error: 'The generated agent profile must not mention tool ids directly.',
      hint: `Remove direct tool mentions from the generated profile, including: ${mentionedToolIds.join(', ')}.`,
    };
  }

  return { valid: true as const };
}

// ─── isToolResultWithOutput ───────────────────────────────────────────────────

export function isToolResultWithOutput(value: unknown): value is { output: unknown } {
  return typeof value === 'object' && value !== null && 'output' in value;
}

// ─── validateHireAgentInput ────────────────────────────────────────────────────

export async function validateHireAgentInput(
  capabilities: ReturnType<typeof createCapabilityStore>,
  roleId: string,
): Promise<
  | { valid: true; roleId: string; roleName: string; roleDescription: string | undefined }
  | { valid: false; error: string; hint?: string }
> {
    const role = await capabilities.getRole(roleId);

    if (!role) {
      return { valid: false, error: `Role "${roleId}" does not exist.`, hint: 'Choose an existing role id from the capability store.' };
    }

    const MINIMUM_BASE_TOOL_IDS = new Set([
      'list_conversations',
      'get_messages',
      'send_message',
      'list_self_crons',
      'manage_self_crons',
    ] as const);

    const roleToolIds = new Set(role.toolIds ?? []);
    const missingTools = [...MINIMUM_BASE_TOOL_IDS].filter((id) => !roleToolIds.has(id));

    if (missingTools.length > 0) {
      return {
        valid: false,
        error: `Role "${role.name}" is missing required base tools: ${missingTools.join(', ')}.`,
        hint: `Call manage_role_capabilities to add the missing tools, then try hireAgent again.`,
      };
    }

    return {
      valid: true,
      roleId: role.id,
      roleName: role.name,
      roleDescription: role.description ?? undefined,
    };
}