import { createId } from '../utils/id';
import { WEEK_MS } from '../shared/constants';
import { eq } from 'drizzle-orm';

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
import type { _CreateAgentConfig } from './runtime/types';
import { getInternalAgentRegistry } from './internal-agent-registry';
import type { _WorkspaceFilesystemConfig, _WorkspaceSandboxConfig } from '../database/schema';
import type { _GitHubAppManager } from '../github/manager';
import type { _AgentEmailManager } from '../email/migadu-manager';
import type { _CoolifyManager } from '../coolify/manager';
import type { _createAgentScheduleManager } from '../schedules/manager';
import type { _InternalChatService } from '../communication/internal-chat-service';
import { DEFAULT_WORKSPACE_EMBEDDER } from './agent-embedder-maintenance';
import { loadAgent } from './agent-loader';
import { forgeDebug } from '@forge-runtime/core';

import { z } from 'zod';

/** Validates HireInternalAgentInput before any DB writes or side effects. */
export const HireInternalAgentInputSchema = z.object({
  agentId: z.string().min(1).optional(),
  roleId: z.string().min(1),
  roleName: z.string().optional(),
  roleDescription: z.string().optional(),
  name: z.string().min(1, 'name is required'),
  description: z.string().optional(),
  instructions: z.string().min(1, 'instructions are required'),
  modelProfileId: z.string().min(1, 'modelProfileId is required'),
  omModelProfileId: z.string().min(1, 'omModelProfileId is required'),
  workspaceBasePath: z.string().min(1, 'workspaceBasePath is required'),
  workspaceFilesystem: z.any().optional(),
  workspaceSandbox: z.any().optional(),
  weeklyBudgetUsd: z.number().nonnegative('weeklyBudgetUsd must be non-negative'),
  providerCredentials: z.record(z.string(), z.any()).optional(),
  githubApps: z.custom<{
    installForRepo: (repo: string) => Promise<void>;
    getInstallationId: (repo: string) => Promise<string>;
  }>().optional().default({} as object),
  emailMailboxes: z.any().nullable().optional(),
  coolify: z.any().nullable().optional(),
  schedules: z.any(),
  internalChat: z.any(),
});

export type HireInternalAgentInput = z.infer<typeof HireInternalAgentInputSchema>;
/**
 * Parses and validates input. Throws ZodError with full field paths on failure.
 * Call this at the top of hireInternalAgent before any I/O.
 */
export function validateHireInternalAgentInput(
  input: unknown,
): HireInternalAgentInput {
  return HireInternalAgentInputSchema.parse(input);
}

/** Shared rollback helper for hire failures at various stages.
 *
 * Cleans up external resources in reverse order of creation, then rolls back
 * the DB transaction by deleting agent records.
 *
 * @param agentId - The agent ID being rolled back
 * @param provisionedMailbox - Email mailbox provisioned (if any)
 * @param emailMailboxes - Email manager (if configured)
 * @param hasHeartbeat - Whether createHeartbeatSchedule succeeded
 * @param hasLoadAgent - Whether loadAgent succeeded
 * @param schedules - Schedule manager
 * @param internalChat - Internal chat service
 * @param tx - The active DB transaction
 */
async function rollbackHire(
  agentId: string,
  provisionedMailbox: { address: string } | null,
  emailMailboxes: HireInternalAgentInput['emailMailboxes'],
  hasHeartbeat: boolean,
  hasLoadAgent: boolean,
  schedules: HireInternalAgentInput['schedules'],
  internalChat: HireInternalAgentInput['internalChat'],
  tx: any,
) {
  // Undo external resources in reverse order of creation
  if (hasHeartbeat || hasLoadAgent) {
    try {
      await schedules.removeAgent(agentId);
    } catch (e) {
      forgeDebug({
        scope: 'hire-agent',
        level: 'warn',
        message: 'Rollback: removeAgent failed',
        context: { agentId, error: e instanceof Error ? e.message : String(e) },
      });
    }
  }

  try {
    await internalChat.deleteAgentAccount({ agentId });
  } catch (e) {
    forgeDebug({
      scope: 'hire-agent',
      level: 'warn',
      message: 'Rollback: deleteAgentAccount failed',
      context: { agentId, error: e instanceof Error ? e.message : String(e) },
    });
  }

  // Delegate DB record + email cleanup to shared helper
  await rollbackHireDbAndEmail(agentId, provisionedMailbox, emailMailboxes, tx);
}
/**
 * Rolls back DB records and cleans up email after a failed hire.
 * @param agentId - The agent ID being rolled back
 * @param provisionedMailbox - Email mailbox provisioned (if any)
 * @param emailMailboxes - Email manager (if configured)
 * @param tx - The active DB transaction
 */
async function rollbackHireDbAndEmail(
  agentId: string,
  provisionedMailbox: { address: string } | null,
  emailMailboxes: HireInternalAgentInput['emailMailboxes'],
  tx: any,
) {
  await tx.delete(agentExecutionContracts).where(eq(agentExecutionContracts.agentId, agentId));
  await tx.delete(agentProviders).where(eq(agentProviders.agentId, agentId));
  await tx.delete(agents).where(eq(agents.id, agentId));

  if (provisionedMailbox && emailMailboxes) {
    try {
      await emailMailboxes.deleteMailboxByAddress(provisionedMailbox.address);
    } catch (e) {
      forgeDebug({
        scope: 'hire-agent',
        level: 'warn',
        message: 'Rollback: deleteMailboxByAddress failed',
        context: { address: provisionedMailbox.address, error: e instanceof Error ? e.message : String(e) },
      });
    }
  }
}

export async function hireInternalAgent(db: Database, input: unknown) {
  const validated = validateHireInternalAgentInput(input);
  const agentId = validated.agentId ?? createId();
  const now = Date.now();
  const shouldProvisionEmail = validated.emailMailboxes ? await validated.emailMailboxes.isConfigured() : false;
  const provisionedMailbox = shouldProvisionEmail
    ? await validated.emailMailboxes!.provisionMailbox({
        agentId,
        agentName: validated.name,
      })
    : null;
  const providerCredentials: ProviderCredentialsMap = {
    'internal-chat': {
      agentId,
      displayName: validated.name,
      description: validated.roleDescription,
    },
    ...validated.providerCredentials,
    ...(provisionedMailbox ? { email: provisionedMailbox.credentials } : {}),
  };
  const agentRecord: NewAgent = {
    id: agentId,
    name: validated.name,
    description: validated.description,
    roleId: validated.roleId,
    modelProfileId: validated.modelProfileId,
    omModelProfileId: validated.omModelProfileId,
    instructions: validated.instructions,
    executionState: 'idle',
    workspaceAutoSync: 1,
    workspaceBm25: 1,
    workspaceEmbedder: DEFAULT_WORKSPACE_EMBEDDER,
    workspaceFilesystem: validated.workspaceFilesystem ?? null,
    workspaceSandbox: validated.workspaceSandbox ?? null,
    createdAt: now,
    updatedAt: now,
  };
  const contractRecord: NewAgentExecutionContract = {
    id: createId(),
    agentId,
    budgetUsd: validated.weeklyBudgetUsd,
    autoRenew: 1,
    startsAt: now,
    endsAt: now + WEEK_MS,
    createdAt: now,
  };

  // Wrap ALL DB writes inside a single transaction.
  // On any error, the transaction aborts and ALL DB writes roll back automatically.
  // No partial agent records can survive a failure (#1857).
  await db.transaction(async (tx: import("better-sqlite3").Transaction<object>) => {
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

    // External operations (chat, schedules, runtime load, registry) happen INSIDE the
    // transaction scope so they are covered by the rollback if anything throws.
    // Each external op has its own cleanup logic for any partial successes.

    try {
      await validated.internalChat.registerAgentAccount({
        agentId,
        displayName: validated.name,
        agentName: validated.name,
        agentDescription: validated.description ?? undefined,
        roleName: validated.roleName,
        roleDescription: validated.roleDescription,
      });
    } catch (err) {
      forgeDebug({ scope: 'hire-agent', level: 'error', message: 'registerAgentAccount failed during hire', context: { agentId, error: err instanceof Error ? err.message : String(err) } });
      // No external ops succeeded yet — undo DB records and email only
      await rollbackHireDbAndEmail(
        agentId,
        provisionedMailbox,
        validated.emailMailboxes,
        tx,
      );
      forgeDebug({ scope: 'hire-agent', level: 'error', message: 'hire-agent: operation failed', error: err instanceof Error ? err.message : String(err) });
      throw err;
    }

    try {
      await validated.schedules.createHeartbeatSchedule(agentId);
    } catch (err) {
      forgeDebug({ scope: 'hire-agent', level: 'error', message: 'createHeartbeatSchedule failed during hire', context: { agentId, error: err instanceof Error ? err.message : String(err) } });
      await rollbackHire(
        agentId,
        provisionedMailbox,
        validated.emailMailboxes,
        false, // hasHeartbeat
        false, // hasLoadAgent
        validated.schedules,
        validated.internalChat,
        tx,
      );
      forgeDebug({ scope: 'hire-agent', level: 'error', message: 'hire-agent: operation failed', error: err instanceof Error ? err.message : String(err) });
      throw err;
    }

    let runtime;
    try {
      runtime = await loadAgent(db, {
        agentId,
        workspaceBasePath: validated.workspaceBasePath,
        githubApps: validated.githubApps,
        emailMailboxes: validated.emailMailboxes,
        coolify: validated.coolify,
        schedules: validated.schedules,
        internalChat: validated.internalChat,
      });
    } catch (err) {
      forgeDebug({ scope: 'hire-agent', level: 'error', message: 'loadAgent failed during hire', context: { agentId, error: err instanceof Error ? err.message : String(err) } });
      await rollbackHire(
        agentId,
        provisionedMailbox,
        validated.emailMailboxes,
        true, // hasHeartbeat
        false, // hasLoadAgent
        validated.schedules,
        validated.internalChat,
        tx,
      );
      forgeDebug({ scope: 'hire-agent', level: 'error', message: 'hire-agent: operation failed', error: err instanceof Error ? err.message : String(err) });
      throw err;
    }

    try {
      await getInternalAgentRegistry().add(db, runtime);
    } catch (err) {
      forgeDebug({ scope: 'hire-agent', level: 'error', message: 'registry.add failed during hire', context: { agentId, error: err instanceof Error ? err.message : String(err) } });
      await rollbackHire(
        agentId,
        provisionedMailbox,
        validated.emailMailboxes,
        true, // hasHeartbeat
        true, // hasLoadAgent
        validated.schedules,
        validated.internalChat,
        tx,
      );
      forgeDebug({ scope: 'hire-agent', level: 'error', message: 'hire-agent: operation failed', error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  });

  return {
    agentId,
    emailAddress: provisionedMailbox?.address ?? null,
  };
}