import { communicationState } from './communication-state';

export function createAgentAccounts() {
  async function ensureAccount(input: {
    agentId: string;
    provider: string;
    externalAccountId: string;
    displayName?: string;
    metadata?: Record<string, unknown>;
  }) {
    const state = await communicationState.read();
    const accountId = `${input.agentId}:${input.provider}:${input.externalAccountId}`;
    let account = state.accounts.find((current) => current.accountId === accountId);

    if (!account) {
      account = {
        accountId,
        agentId: input.agentId,
        provider: input.provider,
        externalAccountId: input.externalAccountId,
      };
      state.accounts.push(account);
    }

    if (input.displayName !== undefined) {
      account.displayName = input.displayName;
    }

    if (input.metadata !== undefined) {
      account.metadata = input.metadata;
    }

    await communicationState.save();
    return accountId;
  }

  async function getAgentProviderAccount(agentId: string, provider: string) {
    const state = await communicationState.read();
    return state.accounts.find((account) => account.agentId === agentId && account.provider === provider) ?? null;
  }

  return {
    ensureAccount,
    getAgentProviderAccount,
  };
}

export const agentAccounts = createAgentAccounts();
