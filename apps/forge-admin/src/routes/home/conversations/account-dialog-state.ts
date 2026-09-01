// apps/forge-admin/src/routes/home/conversations/account-dialog-state.ts
//
// Reducer for the four tightly-coupled useState hooks that drive the
// AccountDialog: open flag, mode (create vs edit), form payload, and the
// last validation error message. Grouping them in one reducer eliminates
// the need to remember which setState calls must fire together when the
// dialog opens or closes.
//
// `accountSaving` is intentionally kept separate (still a useState in
// route.tsx) because it is orthogonal submission lifecycle state, not
// dialog presentation state.
//
// This is sub-PR 1 of 3 for Issue 6709 (the others cover the data
// reducer and the conversation dialog reducer).

import type { AccountDialogMode, AccountForm } from '@/components/home/conversations/context';
import type { InternalChatExternalAccount } from '@/lib/admin-api/index';
import {
  createAccountForm,
  createEmptyAccountForm,
} from '@/components/home/conversations/route-helpers';

export interface AccountDialogState {
  open: boolean;
  mode: AccountDialogMode;
  form: AccountForm;
  formError: string;
}

export type AccountDialogAction =
  | { type: 'open_create' }
  | { type: 'open_edit'; account: InternalChatExternalAccount }
  | { type: 'close' }
  | { type: 'update_form'; updater: (current: AccountForm) => AccountForm }
  | { type: 'set_error'; error: string };

export function createInitialAccountDialogState(): AccountDialogState {
  return {
    open: false,
    mode: 'create',
    form: { ...createEmptyAccountForm() },
    formError: '',
  };
}

export function accountDialogReducer(
  state: AccountDialogState,
  action: AccountDialogAction,
): AccountDialogState {
  switch (action.type) {
    case 'open_create':
      return {
        open: true,
        mode: 'create',
        form: { ...createEmptyAccountForm() },
        formError: '',
      };
    case 'open_edit':
      return {
        open: true,
        mode: 'edit',
        form: createAccountForm(action.account),
        formError: '',
      };
    case 'close':
      if (!state.open) {
        return state;
      }
      return {
        open: false,
        mode: state.mode,
        form: { ...createEmptyAccountForm() },
        formError: '',
      };
    case 'update_form':
      return { ...state, form: action.updater(state.form) };
    case 'set_error':
      if (state.formError === action.error) {
        return state;
      }
      return { ...state, formError: action.error };
  }
}
