// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { createInitialDataState, dataReducer, type DataState } from './data-state';
import type { InternalChatContact, InternalChatExternalAccount } from '@/lib/admin-api/index';
import type { LocalConversation } from '@/components/home/conversations/context';

function makeAccount(overrides: Partial<InternalChatExternalAccount> = {}): InternalChatExternalAccount {
  return {
    accountId: 'acc-1',
    slug: 'acc-1',
    displayName: 'Account 1',
    description: null,
    ...overrides,
  } as InternalChatExternalAccount;
}

function makeContact(account: InternalChatExternalAccount): InternalChatContact {
  return { ...account, isAgent: false };
}

function makeConversation(id: string): LocalConversation {
  return {
    conversationId: id,
    accountId: 'acc-1',
    contactAccountId: 'contact-1',
    contactDisplayName: 'Contact 1',
    lastMessagePreview: '',
    lastMessageAt: 0,
    unreadCount: 0,
  };
}

describe('dataReducer', () => {
  describe('set_accounts / set_contacts / set_conversations', () => {
    it('replaces accounts wholesale', () => {
      const start: DataState = createInitialDataState();
      const next = dataReducer(start, { type: 'set_accounts', accounts: [makeAccount()] });
      expect(next.accounts).toHaveLength(1);
      expect(next.contacts).toHaveLength(0);
      expect(next.conversations).toHaveLength(0);
    });

    it('replaces contacts wholesale', () => {
      const start: DataState = createInitialDataState();
      const account = makeAccount();
      const next = dataReducer(start, { type: 'set_contacts', contacts: [makeContact(account)] });
      expect(next.contacts).toHaveLength(1);
    });

    it('replaces conversations wholesale', () => {
      const start: DataState = createInitialDataState();
      const next = dataReducer(start, {
        type: 'set_conversations',
        conversations: [makeConversation('c-1')],
      });
      expect(next.conversations).toHaveLength(1);
    });
  });

  describe('clear_conversations', () => {
    it('clears conversations to empty array', () => {
      const start: DataState = {
        ...createInitialDataState(),
        conversations: [makeConversation('c-1')],
      };
      const next = dataReducer(start, { type: 'clear_conversations' });
      expect(next.conversations).toHaveLength(0);
    });

    it('is a no-op when already empty', () => {
      const start: DataState = createInitialDataState();
      const next = dataReducer(start, { type: 'clear_conversations' });
      expect(next).toBe(start);
    });
  });

  describe('select_account / clear_selected_account', () => {
    it('select_account sets the selection', () => {
      const start: DataState = createInitialDataState();
      const next = dataReducer(start, { type: 'select_account', accountId: 'acc-2' });
      expect(next.selectedAccountId).toBe('acc-2');
    });

    it('select_account is a no-op when selection unchanged', () => {
      const start: DataState = { ...createInitialDataState(), selectedAccountId: 'acc-1' };
      const next = dataReducer(start, { type: 'select_account', accountId: 'acc-1' });
      expect(next).toBe(start);
    });

    it('clear_selected_account empties the selection', () => {
      const start: DataState = { ...createInitialDataState(), selectedAccountId: 'acc-1' };
      const next = dataReducer(start, { type: 'clear_selected_account' });
      expect(next.selectedAccountId).toBe('');
    });

    it('clear_selected_account is a no-op when already empty', () => {
      const start: DataState = createInitialDataState();
      const next = dataReducer(start, { type: 'clear_selected_account' });
      expect(next).toBe(start);
    });
  });

  describe('add_or_replace_account', () => {
    it('appends new account and matching contact, sorted by displayName', () => {
      const start: DataState = {
        ...createInitialDataState(),
        accounts: [makeAccount({ accountId: 'acc-b', displayName: 'Bravo' })],
        contacts: [makeContact(makeAccount({ accountId: 'acc-b', displayName: 'Bravo' }))],
      };
      const next = dataReducer(start, {
        type: 'add_or_replace_account',
        account: makeAccount({ accountId: 'acc-a', displayName: 'Alpha' }),
      });
      expect(next.accounts.map((a) => a.accountId)).toEqual(['acc-a', 'acc-b']);
      expect(next.contacts.map((c) => c.accountId)).toEqual(['acc-a', 'acc-b']);
      expect(next.contacts[0].isAgent).toBe(false);
    });

    it('replaces existing account by accountId and updates matching contact', () => {
      const original = makeAccount({ accountId: 'acc-1', displayName: 'Original' });
      const start: DataState = {
        ...createInitialDataState(),
        accounts: [original],
        contacts: [makeContact(original)],
      };
      const updated = makeAccount({ accountId: 'acc-1', displayName: 'Updated' });
      const next = dataReducer(start, { type: 'add_or_replace_account', account: updated });
      expect(next.accounts[0].displayName).toBe('Updated');
      expect(next.contacts[0].displayName).toBe('Updated');
      expect(next.accounts).toHaveLength(1);
      expect(next.contacts).toHaveLength(1);
    });
  });

  describe('remove_account_by_id', () => {
    it('removes account and its matching contact, clears selection if matched', () => {
      const acc1 = makeAccount({ accountId: 'acc-1', displayName: 'Account 1' });
      const acc2 = makeAccount({ accountId: 'acc-2', displayName: 'Account 2' });
      const start: DataState = {
        ...createInitialDataState(),
        accounts: [acc1, acc2],
        contacts: [makeContact(acc1), makeContact(acc2)],
        selectedAccountId: 'acc-1',
        conversations: [makeConversation('c-1')],
      };
      const next = dataReducer(start, { type: 'remove_account_by_id', accountId: 'acc-1' });
      expect(next.accounts).toHaveLength(1);
      expect(next.accounts[0].accountId).toBe('acc-2');
      expect(next.contacts).toHaveLength(1);
      expect(next.selectedAccountId).toBe('');
      expect(next.conversations).toHaveLength(0);
    });

    it('removes account + contact without touching selection when not matched', () => {
      const acc1 = makeAccount({ accountId: 'acc-1' });
      const acc2 = makeAccount({ accountId: 'acc-2' });
      const start: DataState = {
        ...createInitialDataState(),
        accounts: [acc1, acc2],
        contacts: [makeContact(acc1), makeContact(acc2)],
        selectedAccountId: 'acc-2',
      };
      const next = dataReducer(start, { type: 'remove_account_by_id', accountId: 'acc-1' });
      expect(next.selectedAccountId).toBe('acc-2');
    });

    it('is a no-op when accountId does not exist', () => {
      const acc1 = makeAccount({ accountId: 'acc-1' });
      const start: DataState = {
        ...createInitialDataState(),
        accounts: [acc1],
        contacts: [makeContact(acc1)],
        selectedAccountId: 'acc-1',
      };
      const next = dataReducer(start, { type: 'remove_account_by_id', accountId: 'acc-missing' });
      expect(next).toBe(start);
    });
  });
});

describe('createInitialDataState', () => {
  it('returns empty state when no storageKey provided', () => {
    const state = createInitialDataState();
    expect(state.accounts).toHaveLength(0);
    expect(state.contacts).toHaveLength(0);
    expect(state.conversations).toHaveLength(0);
    expect(state.selectedAccountId).toBe('');
  });

  it('reads selectedAccountId from localStorage when storageKey provided', () => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem('test-key', 'acc-99');
    const state = createInitialDataState('test-key');
    expect(state.selectedAccountId).toBe('acc-99');
    window.localStorage.removeItem('test-key');
  });
});
