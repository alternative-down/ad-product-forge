import type { State } from './message-state';
import { messageState } from './message-state';
import type { SenderInput, SenderResult } from './message-types';

export function createAccountRegistry() {
  const senders = new Map<string, (input: SenderInput) => Promise<SenderResult>>();

  async function ensureAccount(input: {
    agentId: string;
    provider: string;
    externalAccountId: string;
    displayName?: string;
    metadata?: Record<string, unknown>;
  }) {
    return messageState.update((state) => {
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

      return accountId;
    });
  }

  function registerSender(accountId: string, sender: (input: SenderInput) => Promise<SenderResult>) {
    senders.set(accountId, sender);
  }

  function unregisterSender(accountId: string) {
    senders.delete(accountId);
  }

  function getSender(accountId: string) {
    return senders.get(accountId) ?? null;
  }

  function getAgentAccountIds(state: State, agentId: string, provider?: string) {
    return new Set(
      state.accounts
        .filter((account) => account.agentId === agentId)
        .filter((account) => !provider || account.provider === provider)
        .map((account) => account.accountId),
    );
  }

  function getAgentProviderAccount(state: State, agentId: string, provider: string) {
    return state.accounts.find(
      (account) => account.agentId === agentId && account.provider === provider,
    ) ?? null;
  }

  return {
    ensureAccount,
    registerSender,
    unregisterSender,
    getSender,
    getAgentAccountIds,
    getAgentProviderAccount,
  };
}
