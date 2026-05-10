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


export type HireInternalAgentInput = {
  agentId?: string;
  roleId: string;
  roleName?: string;
  roleDescription?: string;
  name: string;
  description?: string;
  instructions: string;
  modelProfileId: string;
  omModelProfileId: string;
  workspaceBasePath: string;
  workspaceFilesystem?: WorkspaceFilesystemConfig;
  workspaceSandbox?: WorkspaceSandboxConfig;
  weeklyBudgetUsd: number;
  providerCredentials?: ProviderCredentialsMap;
  githubApps: GitHubAppManager;
  emailMailboxes: AgentEmailManager | null;
  coolify: CoolifyManager | null;
  schedules: ReturnType<typeof createAgentScheduleManager>;
  internalChat: InternalChatService;
};

export async function hireInternalAgent(db: Database, input: HireInternalAgentInput) {
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
    ...input.providerCredentials,
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

  let registryAdded = false;

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

    try {
      await input.internalChat.registerAgentAccount({
        agentId,
        displayName: input.name,
        agentName: input.name,
        agentDescription: input.description ?? undefined,
        roleName: input.roleName,
        roleDescription: input.roleDescription,
      });
    } catch (err) {
      forgeDebug({ scope: 'hire-agent', level: 'error', message: 'registerAgentAccount failed during hire', context: { agentId, error: err instanceof Error ? err.message : String(err) } });
      // Compensating transaction: rollback DB records (no external ops succeeded yet)
      await db.transaction(async (tx) => {
        await tx.delete(agentExecutionContracts).where(eq(agentExecutionContracts.agentId, agentId));
        await tx.delete(agentProviders).where(eq(agentProviders.agentId, agentId));
        await tx.delete(agents).where(eq(agents.id, agentId));
      });
      if (provisionedMailbox && input.emailMailboxes) {
        try {
          await input.emailMailboxes.deleteMailboxByAddress(provisionedMailbox.address);
        } catch (e) {
          forgeDebug({ scope: 'hire-agent', level: 'warn', message: 'Rollback: deleteMailboxByAddress failed', context: { address: provisionedMailbox.address, error: e instanceof Error ? e.message : String(e) } });
        }
      }
      forgeDebug({ scope: 'hire-agent', level: 'error', message: 'hire-agent: operation failed', error: err instanceof Error ? err.message : String(err) });
      throw err;
    }

    try {
      await input.schedules.createHeartbeatSchedule(agentId);
    } catch (err) {
      forgeDebug({ scope: 'hire-agent', level: 'error', message: 'createHeartbeatSchedule failed during hire', context: { agentId, error: err instanceof Error ? err.message : String(err) } });
      // Compensating transaction: undo registerAgentAccount, then rollback DB
      try {
        await input.internalChat.deleteAgentAccount({ agentId });
      } catch (e) {
        forgeDebug({ scope: 'hire-agent', level: 'warn', message: 'Rollback: deleteAgentAccount failed', context: { agentId, error: e instanceof Error ? e.message : String(e) } });
      }
      await db.transaction(async (tx) => {
        await tx.delete(agentExecutionContracts).where(eq(agentExecutionContracts.agentId, agentId));
        await tx.delete(agentProviders).where(eq(agentProviders.agentId, agentId));
        await tx.delete(agents).where(eq(agents.id, agentId));
      });
      if (provisionedMailbox && input.emailMailboxes) {
        try {
          await input.emailMailboxes.deleteMailboxByAddress(provisionedMailbox.address);
        } catch (e) {
          forgeDebug({ scope: 'hire-agent', level: 'warn', message: 'Rollback: deleteMailboxByAddress failed', context: { address: provisionedMailbox.address, error: e instanceof Error ? e.message : String(e) } });
        }
      }
      forgeDebug({ scope: 'hire-agent', level: 'error', message: 'hire-agent: operation failed', error: err instanceof Error ? err.message : String(err) });
      throw err;
    }

    let runtime;
    try {
      runtime = await loadAgent(db, {
        agentId,
        workspaceBasePath: input.workspaceBasePath,
        githubApps: input.githubApps,
        emailMailboxes: input.emailMailboxes,
        coolify: input.coolify,
        schedules: input.schedules,
        internalChat: input.internalChat,
      });
    } catch (err) {
      forgeDebug({ scope: 'hire-agent', level: 'error', message: 'loadAgent failed during hire', context: { agentId, error: err instanceof Error ? err.message : String(err) } });
      // Compensating transaction: undo heartbeat schedule, undo chat account, rollback DB
      try {
        await input.schedules.removeAgent(agentId);
      } catch (e) {
        forgeDebug({ scope: 'hire-agent', level: 'warn', message: 'Rollback: removeAgent failed', context: { agentId, error: e instanceof Error ? e.message : String(e) } });
      }
      try {
        await input.internalChat.deleteAgentAccount({ agentId });
      } catch (e) {
        forgeDebug({ scope: 'hire-agent', level: 'warn', message: 'Rollback: deleteAgentAccount failed', context: { agentId, error: e instanceof Error ? e.message : String(e) } });
      }
      await db.transaction(async (tx) => {
        await tx.delete(agentExecutionContracts).where(eq(agentExecutionContracts.agentId, agentId));
        await tx.delete(agentProviders).where(eq(agentProviders.agentId, agentId));
        await tx.delete(agents).where(eq(agents.id, agentId));
      });
      if (provisionedMailbox && input.emailMailboxes) {
        try {
          await input.emailMailboxes.deleteMailboxByAddress(provisionedMailbox.address);
        } catch (e) {
          forgeDebug({ scope: 'hire-agent', level: 'warn', message: 'Rollback: deleteMailboxByAddress failed', context: { address: provisionedMailbox.address, error: e instanceof Error ? e.message : String(e) } });
        }
      }
      forgeDebug({ scope: 'hire-agent', level: 'error', message: 'hire-agent: operation failed', error: err instanceof Error ? err.message : String(err) });
      throw err;
    }

    try {
      await getInternalAgentRegistry().add(db, runtime);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      registryAdded = true;
    } catch (err) {
      forgeDebug({ scope: 'hire-agent', level: 'error', message: 'registry.add failed during hire', context: { agentId, error: err instanceof Error ? err.message : String(err) } });
      // Compensating transaction: undo heartbeat schedule, undo chat account, rollback DB
      try {
        await input.schedules.removeAgent(agentId);
      } catch (e) {
        forgeDebug({ scope: 'hire-agent', level: 'warn', message: 'Rollback: removeAgent failed', context: { agentId, error: e instanceof Error ? e.message : String(e) } });
      }
      try {
        await input.internalChat.deleteAgentAccount({ agentId });
      } catch (e) {
        forgeDebug({ scope: 'hire-agent', level: 'warn', message: 'Rollback: deleteAgentAccount failed', context: { agentId, error: e instanceof Error ? e.message : String(e) } });
      }
      await db.transaction(async (tx) => {
        await tx.delete(agentExecutionContracts).where(eq(agentExecutionContracts.agentId, agentId));
        await tx.delete(agentProviders).where(eq(agentProviders.agentId, agentId));
        await tx.delete(agents).where(eq(agents.id, agentId));
      });
      if (provisionedMailbox && input.emailMailboxes) {
        try {
          await input.emailMailboxes.deleteMailboxByAddress(provisionedMailbox.address);
        } catch (e) {
          forgeDebug({ scope: 'hire-agent', level: 'warn', message: 'Rollback: deleteMailboxByAddress failed', context: { address: provisionedMailbox.address, error: e instanceof Error ? e.message : String(e) } });
        }
      }
      forgeDebug({ scope: 'hire-agent', level: 'error', message: 'hire-agent: operation failed', error: err instanceof Error ? err.message : String(err) });
      throw err;
    }

    return {
      agentId,
      emailAddress: provisionedMailbox?.address ?? null,
    };
  } catch (error) {
    // Top-level fallback: if DB transaction itself failed, clean up provisioned mailbox
    if (provisionedMailbox && input.emailMailboxes) {
      try {
        await input.emailMailboxes.deleteMailboxByAddress(provisionedMailbox.address);
      } catch (e) {
        forgeDebug({ scope: 'hire-agent', level: 'warn', message: 'Rollback: deleteMailboxByAddress failed (top-level)', context: { address: provisionedMailbox.address, error: e instanceof Error ? e.message : String(e) } });
      }
    }
    forgeDebug({ scope: 'hire-agent', level: 'error', message: 'hire-agent: operation failed', error: error instanceof Error ? error.message : String(error) });
    throw error;
  } finally {
    registryAdded = false;
  }
}
