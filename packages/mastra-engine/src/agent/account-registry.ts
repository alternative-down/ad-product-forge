import { agentState } from './state';

export function createAccountRegistry() {
  async function ensureAccount(input: {
    agentId: string;
    provider: string;
    externalAccountId: string;
    displayName?: string;
    metadata?: Record<string, unknown>;
  }) {
    const state = await agentState.read();
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

    await agentState.save();
    return accountId;
  }

  async function getAgentProviderAccount(agentId: string, provider: string) {
    const state = await agentState.read();
    return state.accounts.find((account) => account.agentId === agentId && account.provider === provider) ?? null;
  }

  return {
    ensureAccount,
    getAgentProviderAccount,
  };
}

export const accountRegistry = createAccountRegistry();
