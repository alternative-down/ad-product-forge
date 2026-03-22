import { createId } from '@paralleldrive/cuid2';
import { eq } from 'drizzle-orm';

import type { Database } from '../database/index';
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
import type { CreateAgentConfig } from './create-forge-agent';
import { getInternalAgentRegistry } from './internal-agent-registry';
import type { WorkspaceFilesystemConfig, WorkspaceSandboxConfig } from '../database/schema';
import type { GitHubAppManager } from '../github/manager';
import type { AgentEmailManager } from '../email/migadu-manager';
import type { CoolifyManager } from '../coolify/manager';
import type { createAgentScheduleManager } from '../schedules/manager';
import { loadAgent } from './agent-loader';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type HireInternalAgentInput = {
  agentId?: string;
  functionId: string;
  functionDescription?: string;
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
  workflows?: CreateAgentConfig['workflows'];
  githubApps: GitHubAppManager;
  emailMailboxes: AgentEmailManager | null;
  coolify: CoolifyManager | null;
  schedules: ReturnType<typeof createAgentScheduleManager>;
};

export async function hireInternalAgent(db: Database, input: HireInternalAgentInput) {
  const agentId = input.agentId ?? createId();

  if (!input.emailMailboxes) {
    throw new Error('Migadu email provisioning is required for hiring but is not configured');
  }

  const now = Date.now();
  const provisionedMailbox = await input.emailMailboxes.provisionMailbox({
    agentId,
    agentName: input.name,
  });
  const providerCredentials: ProviderCredentialsMap = {
    'internal-chat': {
      agentId,
      displayName: input.name,
      description: input.functionDescription,
    },
    ...input.providerCredentials,
    email: provisionedMailbox.credentials,
  };
  const agentRecord: NewAgent = {
    id: agentId,
    name: input.name,
    description: input.description,
    functionId: input.functionId,
    modelProfileId: input.modelProfileId,
    omModelProfileId: input.omModelProfileId,
    instructions: input.instructions,
    executionState: 'idle',
    workspaceAutoSync: 1,
    workspaceBm25: 1,
    workspaceEmbedder: 'fastembed',
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
    await db.insert(agents).values(agentRecord);

    await db.insert(agentExecutionContracts).values(contractRecord);

    for (const [providerType, credentials] of Object.entries(providerCredentials)) {
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

      await db.insert(agentProviders).values(providerRecord);
    }

    await input.schedules.createHeartbeatSchedule(agentId);
    const runtime = await loadAgent(db, {
      agentId,
      workspaceBasePath: input.workspaceBasePath,
      workflows: input.workflows,
      githubApps: input.githubApps,
      coolify: input.coolify,
      schedules: input.schedules,
    });

    await getInternalAgentRegistry().add(db, runtime);

    return {
      agentId,
      emailAddress: provisionedMailbox.address,
    };
  } catch (error) {
    getInternalAgentRegistry().remove(agentId);
    await db.delete(agents).where(eq(agents.id, agentId));
    await input.emailMailboxes.deleteMailboxByAddress(provisionedMailbox.address);
    throw error;
  }
}
