import { createId } from '../utils/id';
import { WEEK_MS } from '../shared/constants';
import { eq } from 'drizzle-orm';
import { z } from 'zod';


import type {Database} from '../database/schema';
import {
  agents,
  agentExecutionContracts,
  agentProviders,
  type NewAgent,
  type NewAgentExecutionContract,
  type NewAgentProvider,
} from '../database/schema';
import type { ProviderCredentialsMap } from '../communication/provider-loader';
import { encryptSecret } from '../encryption/crypto';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { CreateAgentConfig } from './runtime/types';
import { getInternalAgentRegistry } from './internal-agent-registry';
import type { WorkspaceFilesystemConfig, WorkspaceSandboxConfig } from '../database/schema';
import type { GitHubAppManager } from '../github/manager';
import type { AgentEmailManager } from '../email/migadu-manager';
import type { CoolifyManager } from '../coolify/manager';
import type { createAgentScheduleManager } from '../schedules/manager';
import type { InternalChatService } from '../communication/internal-chat-service';
import { DEFAULT_WORKSPACE_EMBEDDER } from './agent-embedder-maintenance';
import { loadAgent } from './agent-loader';
import { forgeDebug } from '@forge-runtime/core';

// ─── HireInternalAgentInput schema ────────────────────────────────────────────

const workspaceFilesystemSchema = z.object({
  type: z.literal('local'),
  path: z.string().min(1),
}).strict();

const workspaceSandboxSchema = z.object({
  type: z.literal('sandboxed'),
  image: z.string().min(1),
  memoryLimitMb: z.number().int().positive().optional(),
}).strict();

export const hireInternalAgentInputSchema = z.object({
  /**
   * Optional — a stable ID can be supplied to re-hire the same agent.
   * If omitted, a new ID is generated via createId().
   */
  agentId: z.string().cuid2().optional(),
  /** Required role identifier — maps to a provisioned capability profile. */
  roleId: z.string().min(1),
  roleName: z.string().max(120).optional(),
  roleDescription: z.string().max(500).optional(),
  /** Agent display name, used in UI and email addresses. */
  name: z.string().min(1).max(80),
  description: z.string().max(300).optional(),
  /** Full system-prompt text governing agent behaviour. */
  instructions: z.string().min(1),
  modelProfileId: z.string().min(1),
  omModelProfileId: z.string().min(1),
  workspaceBasePath: z.string().min(1),
  workspaceFilesystem: workspaceFilesystemSchema.optional(),
  workspaceSandbox: workspaceSandboxSchema.optional(),
  weeklyBudgetUsd: z.number().nonnegative(),
  providerCredentials: z.record(z.string(), z.unknown()).optional(),
  githubApps: z.instanceof(Object).refine(
    (v) => typeof (v as { registerAgent?: unknown }).registerAgent === 'function',
    { message: 'githubApps must implement registerAgent(agentId, config)' },
  ),
  emailMailboxes: z.instanceof(Object).refine(
    (v) => typeof (v as { isConfigured?: unknown }).isConfigured === 'function',
    { message: 'emailMailboxes must implement isConfigured()' },
  ).nullable().optional(),
  coolify: z.instanceof(Object).refine(
    (v) => typeof (v as { provisionAgent?: unknown }).provisionAgent === 'function',
    { message: 'coolify must implement provisionAgent(agentId, config)' },
  ).nullable().optional(),
  schedules: z.instanceof(Object).refine(
    (v) => typeof (v as { create?: unknown }).create === 'function',
    { message: 'schedules must implement create(schedule)' },
  ),
  internalChat: z.instanceof(Object).refine(
    (v) => typeof (v as { registerAgentAccount?: unknown }).registerAgentAccount === 'function',
    { message: 'internalChat must implement registerAgentAccount(agentId, displayName)' },
  ),
});

export type HireInternalAgentInput = z.infer<typeof hireInternalAgentInputSchema>;

// ─── hireInternalAgent ─────────────────────────────────────────────────────────

export async function hireInternalAgent(db: Database, rawInput: unknown) {
  const input = hireInternalAgentInputSchema.parse(rawInput);

  const agentId = input.agentId ?? createId();
  const now = Date.now();
  const shouldProvisionEmail = input.emailMailboxes ? await input.emailMailboxes.isConfigured() : false;
  const provisionedMailbox = shouldProvisionEmail
    ? await input.emailMailboxes!.provisionMailbox({
        agentId,
        agentName: input.name,
      })
    : null;
  const providerCredentials: ProviderCredentialsMap = {
    'internal-chat': {
      agentId,
      displayName: input.name,
      description: input.roleDescription,
    },
    ...(input.providerCredentials as ProviderCredentialsMap | undefined),
    ...(provisionedMailbox ? { email: provisionedMailbox.credentials } : {}),
  };
  const agentRecord: NewAgent = {
    id: agentId,
    name: input.name,
    description: input.description,
    roleId: input.roleId,
    modelProfileId: input.modelProfileId,
    omModelProfileId: input.omModelProfileId,
    instructions: input.instructions,
    executionState: 'idle',
    workspaceAutoSync: 1,
    workspaceBm25: 1,
    workspaceEmbedder: DEFAULT_WORKSPACE_EMBEDDER,
    workspaceFilesystem: input.workspaceFilesystem ?? null,
    workspaceSandbox: input.workspaceSandbox ?? null,
    createdAt: now,
    updatedAt: now,
  };
  const contractRecord: NewAgentExecutionContract = {
    id: createId(),
    agentId,
    budgetUsd: input.weeklyBudgetUsd,
    autoRenew: 1,
    startsAt: now,
    endsAt: now + WEEK_MS,
    createdAt: now,
  };

  try {
    await db.transaction(async (tx) => {
      await tx.insert(agents).values(agentRecord);
      await tx.insert(agentExecutionContracts).values(contractRecord);

      for (const [providerType, credentials] of Object.entries(providerCredentials)) {
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (!credentials) {
          continue;
        }

        const providerRecord: NewAgentProvider = {
          id: createId(),
          agentId,
          providerType,
          encryptedCredentials: encryptSecret(JSON.stringify(credentials)),
          createdAt: now,
        };

        await tx.insert(agentProviders).values(providerRecord);
      }
    });
  } catch (err) {
    forgeDebug({ scope: 'hire-agent', level: 'error', message: 'hire-agent: database insert failed', context: { error: err instanceof Error ? err.message : String(err) } });
    throw err;
  }

  const registry = getInternalAgentRegistry();
  registry.register(agentId, {
    id: agentId,
    db,
    name: input.name,
    githubApps: input.githubApps,
    emailMailboxes: input.emailMailboxes,
    coolify: input.coolify,
    schedules: input.schedules,
    internalChat: input.internalChat,
  });

  try {
    await input.githubApps.registerAgent(agentId, {
      displayName: input.name,
      workspaceBasePath: input.workspaceBasePath,
      workspaceFilesystem: input.workspaceFilesystem,
      workspaceSandbox: input.workspaceSandbox,
      instructions: input.instructions,
      modelProfileId: input.modelProfileId,
      omModelProfileId: input.omModelProfileId,
    });
  } catch (err) {
    forgeDebug({ scope: 'hire-agent', level: 'error', message: 'hire-agent: github-apps registration failed', context: { error: err instanceof Error ? err.message : String(err) } });
  }

  if (input.coolify) {
    try {
      await input.coolify.provisionAgent(agentId, {
        displayName: input.name,
        workspaceBasePath: input.workspaceBasePath,
      });
    } catch (err) {
      forgeDebug({ scope: 'hire-agent', level: 'error', message: 'hire-agent: coolify provisioning failed', context: { error: err instanceof Error ? err.message : String(err) } });
    }
  }

  try {
    await loadAgent(agentId);
  } catch (err) {
    forgeDebug({ scope: 'hire-agent', level: 'error', message: 'hire-agent: loadAgent failed', context: { error: err instanceof Error ? err.message : String(err) } });
  }

  return {
    agentId,
    emailAddress: provisionedMailbox?.address ?? null,
  };
}