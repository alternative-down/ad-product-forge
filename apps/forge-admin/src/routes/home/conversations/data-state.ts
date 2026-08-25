// apps/forge-admin/src/routes/home/conversations/data-state.ts
//
// Reducer for the four tightly-coupled data hooks in HomeConversationsLayoutRoute:
// accounts (InternalChatExternalAccount[]), contacts (InternalChatContact[]),
// conversations (LocalConversation[]), and selectedAccountId (with localStorage
// persistence). Grouping them in a single reducer captures the implicit invariant
// that the contacts list mirrors the accounts list by accountId, so updates must
// apply to both atomically.
//
// This is sub-PR 2 of 3 for Issue 6709 (the others cover the account dialog
// reducer and the conversation dialog reducer).
//
// Why a single reducer (instead of 3 independent reducers):
//   - accounts + contacts share accountId and must stay in sync (delete an
//     account → remove the matching contact in the same transition)
//   - selectedAccountId is the selection key for accounts; clearing the
//     selection belongs in the same transition as clearing conversations
//   - conversations are derived state of selectedAccountId and reload atomically
//
// Persistence:
//   - selectedAccountId is initialized from window.localStorage in
//     createInitialDataState via the optional storageKey parameter. The route
//     still writes to localStorage in a useEffect; the reducer is the source of
//     truth and the localStorage write is a side effect.

import type { InternalChatContact, InternalChatExternalAccount } from '@/lib/admin-api/index';
import type { LocalConversation } from '@/components/home/conversations/context';

export interface DataState {
  accounts: InternalChatExternalAccount[];
  contacts: InternalChatContact[];
  conversations: LocalConversation[];
  selectedAccountId: string;
}

export type DataAction =
  | { type: 'set_accounts'; accounts: InternalChatExternalAccount[] }
  | { type: 'set_contacts'; contacts: InternalChatContact[] }
  | { type: 'set_conversations'; conversations: LocalConversation[] }
  | { type: 'clear_conversations' }
  | { type: 'select_account'; accountId: string }
  | { type: 'clear_selected_account' }
  | { type: 'add_or_replace_account'; account: InternalChatExternalAccount }
  | { type: 'remove_account_by_id'; accountId: string };

export function createInitialDataState(storageKey?: string): DataState {
  let initialSelectedAccountId = '';

  if (storageKey !== undefined && typeof window !== 'undefined') {
    initialSelectedAccountId = window.localStorage.getItem(storageKey) ?? '';
  }

  return {
    accounts: [],
    contacts: [],
    conversations: [],
    selectedAccountId: initialSelectedAccountId,
  };
}

function sortByDisplayName<T extends { displayName: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => left.displayName.localeCompare(right.displayName));
}

export function dataReducer(state: DataState, action: DataAction): DataState {
  switch (action.type) {
    case 'set_accounts':
      return { ...state, accounts: action.accounts };

    case 'set_contacts':
      return { ...state, contacts: action.contacts };

    case 'set_conversations':
      return { ...state, conversations: action.conversations };

    case 'clear_conversations':
      if (state.conversations.length === 0) {
        return state;
      }
      return { ...state, conversations: [] };

    case 'select_account':
      if (state.selectedAccountId === action.accountId) {
        return state;
      }
      return { ...state, selectedAccountId: action.accountId };

    case 'clear_selected_account':
      if (state.selectedAccountId === '') {
        return state;
      }
      return { ...state, selectedAccountId: '' };

    case 'add_or_replace_account': {
      const isUpdate = state.accounts.some((item) => item.accountId === action.account.accountId);
      const nextAccounts = isUpdate
        ? state.accounts.map((item) =>
            item.accountId === action.account.accountId ? action.account : item,
          )
        : sortByDisplayName([...state.accounts, action.account]);

      const nextContact: InternalChatContact = {
        ...action.account,
        isAgent: false,
      };

      const isContactUpdate = state.contacts.some((item) => item.accountId === nextContact.accountId);
      const nextContacts = isContactUpdate
        ? state.contacts.map((item) =>
            item.accountId === nextContact.accountId ? nextContact : item,
          )
        : sortByDisplayName([...state.contacts, nextContact]);

      return { ...state, accounts: nextAccounts, contacts: nextContacts };
    }

    case 'remove_account_by_id': {
      const nextAccounts = state.accounts.filter((item) => item.accountId !== action.accountId);
      const nextContacts = state.contacts.filter((item) => item.accountId !== action.accountId);

      const nextSelected =
        state.selectedAccountId === action.accountId ? '' : state.selectedAccountId;

      if (
        nextAccounts.length === state.accounts.length &&
        nextContacts.length === state.contacts.length &&
        nextSelected === state.selectedAccountId
      ) {
        return state;
      }

      const nextConversations =
        nextSelected === '' ? [] : state.conversations;

      return {
        ...state,
        accounts: nextAccounts,
        contacts: nextContacts,
        selectedAccountId: nextSelected,
        conversations: nextConversations,
      };
    }
  }
}
