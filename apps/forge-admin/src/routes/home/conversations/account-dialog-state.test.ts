// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  accountDialogReducer,
  createInitialAccountDialogState,
  type AccountDialogState,
} from './account-dialog-state';
import type { InternalChatExternalAccount } from '@/lib/admin-api/index';

function makeAccount(overrides: Partial<InternalChatExternalAccount> = {}): InternalChatExternalAccount {
  return {
    accountId: 'acc-1',
    slug: 'acc-1',
    displayName: 'Account 1',
    description: null,
    ...overrides,
  } as InternalChatExternalAccount;
}

describe('accountDialogReducer', () => {
  it('open_create resets form, mode, and error in one transition', () => {
    const start: AccountDialogState = {
      open: true,
      mode: 'edit',
      form: { ...createInitialAccountDialogState().form, slug: 'stale' },
      formError: 'stale error',
    };

    const next = accountDialogReducer(start, { type: 'open_create' });

    expect(next.open).toBe(true);
    expect(next.mode).toBe('create');
    expect(next.formError).toBe('');
    expect(next.form.slug).toBe('');
  });

  it('open_edit switches mode and hydrates form from the selected account', () => {
    const account = makeAccount({ displayName: 'Edited Account' });
    const next = accountDialogReducer(createInitialAccountDialogState(), {
      type: 'open_edit',
      account,
    });

    expect(next.open).toBe(true);
    expect(next.mode).toBe('edit');
    expect(next.form.accountId).toBe(account.accountId);
    expect(next.form.displayName).toBe('Edited Account');
    expect(next.formError).toBe('');
  });

  it('close is a no-op when already closed', () => {
    const state = createInitialAccountDialogState();
    const next = accountDialogReducer(state, { type: 'close' });

    expect(next).toBe(state);
  });

  it('close resets the form when the dialog was open', () => {
    const open = accountDialogReducer(createInitialAccountDialogState(), {
      type: 'open_edit',
      account: makeAccount({ displayName: 'Edited' }),
    });
    const closed = accountDialogReducer(open, { type: 'close' });

    expect(closed.open).toBe(false);
    expect(closed.form.displayName).toBe('');
    expect(closed.formError).toBe('');
  });

  it('update_form runs the updater against the current form', () => {
    const state = createInitialAccountDialogState();
    const next = accountDialogReducer(state, {
      type: 'update_form',
      updater: (current) => ({ ...current, displayName: 'Renamed' }),
    });

    expect(next.form.displayName).toBe('Renamed');
  });

  it('set_error preserves identity when the value is unchanged', () => {
    const state = createInitialAccountDialogState();
    const next = accountDialogReducer(state, { type: 'set_error', error: '' });

    expect(next).toBe(state);
  });

  it('set_error replaces the error message', () => {
    const state = createInitialAccountDialogState();
    const next = accountDialogReducer(state, {
      type: 'set_error',
      error: 'Falha ao salvar',
    });

    expect(next.formError).toBe('Falha ao salvar');
  });
});
