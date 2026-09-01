import { Outlet, createFileRoute, useNavigate, useRouterState } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';

import {
  createHomeInternalChatConversation,
  createInternalChatAccount,
  deleteInternalChatAccount,
  getHomeInternalChatConversations,
  getInternalChatAccounts,
  getInternalChatContacts,
  type InternalChatExternalAccount,
  type InternalChatContact,
  updateInternalChatAccount,
} from '@/lib/admin-api/index';
import { logger } from '@/lib/logger';
import {
  HomeConversationsProvider,
  slugify,
  type ConversationForm,
  type LocalConversation,
} from '@/components/home/conversations/context';
import {
  accountDialogReducer,
  createInitialAccountDialogState,
} from './account-dialog-state';
import {
  createInitialDataState,
  dataReducer,
} from './data-state';
import { AccountDialog } from '@/components/home/conversations/account-dialog';
import { ConversationListPane } from '@/components/home/conversations/conversation-list-pane';
import { NewConversationDialog } from '@/components/home/conversations/new-conversation-dialog';
import {
  createConversationForm,
  normalizeAccount,
  normalizeConversations,
  SELECTED_ACCOUNT_STORAGE_KEY,
} from '@/components/home/conversations/route-helpers';

export const Route = createFileRoute('/home/conversations')({
  component: HomeConversationsLayoutRoute,
});

function HomeConversationsLayoutRoute() {
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const [data, dispatchData] = useReducer(
    dataReducer,
    undefined,
    () => createInitialDataState(SELECTED_ACCOUNT_STORAGE_KEY),
  );
  const { accounts, contacts, conversations, selectedAccountId } = data;
  const setAccounts = (next: InternalChatExternalAccount[] | ((prev: InternalChatExternalAccount[]) => InternalChatExternalAccount[])) => {
    const value = typeof next === 'function' ? next(data.accounts) : next;
    dispatchData({ type: 'set_accounts', accounts: value });
  };
  const setContacts = (next: InternalChatContact[] | ((prev: InternalChatContact[]) => InternalChatContact[])) => {
    const value = typeof next === 'function' ? next(data.contacts) : next;
    dispatchData({ type: 'set_contacts', contacts: value });
  };
  const setConversations = (next: LocalConversation[] | ((prev: LocalConversation[]) => LocalConversation[])) => {
    const value = typeof next === 'function' ? next(data.conversations) : next;
    dispatchData({ type: 'set_conversations', conversations: value });
  };
  const setSelectedAccountId = (value: string) => {
    if (value === '') {
      dispatchData({ type: 'clear_selected_account' });
    } else {
      dispatchData({ type: 'select_account', accountId: value });
    }
  };
  const [conversationDialogOpen, setConversationDialogOpen] = useState(false);
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountDialog, dispatchAccountDialog] = useReducer(
    accountDialogReducer,
    undefined,
    createInitialAccountDialogState,
  );
  const { open: accountDialogOpen, mode: accountDialogMode, form: accountForm, formError: accountFormError } = accountDialog;
  const [conversationForm, setConversationForm] =
    useState<ConversationForm>(createConversationForm);

  useEffect(() => {
    let cancelled = false;

    async function loadAccounts() {
      try {
        const [accountItems, contactItems] = await Promise.all([
          getInternalChatAccounts(),
          getInternalChatContacts(),
        ]);

        if (!cancelled) {
          setAccounts(accountItems);
          setContacts(contactItems);
        }
      } catch (error) {
        logger.error('HomeConversations: Failed to load internal chat accounts', error);
      }
    }

    void loadAccounts();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!selectedAccountId) {
      window.localStorage.removeItem(SELECTED_ACCOUNT_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(SELECTED_ACCOUNT_STORAGE_KEY, selectedAccountId);
  }, [selectedAccountId]);

  const selectedAccount =
    accounts.find((account) => account.accountId === selectedAccountId) ?? null;
  const selectedAccountLabel = selectedAccount?.displayName ?? 'Selecione uma conta';
  const availableContacts = contacts.filter((contact) => contact.accountId !== selectedAccountId);
  const selectedConversationId = pathname.startsWith('/home/conversations/')
    ? decodeURIComponent(pathname.slice('/home/conversations/'.length))
    : '';
  const mobileDetailOpen = Boolean(selectedConversationId);

  const reloadConversations = useCallback(async () => {
    if (!selectedAccountId) {
      setConversations([]);
      return;
    }

    try {
      const items = await getHomeInternalChatConversations(selectedAccountId);

      setConversations(normalizeConversations(items));
    } catch (error) {
      logger.error('HomeConversations: Failed to load conversations', error);
      setConversations([]);
    }
  }, [selectedAccountId]);

  useEffect(() => {
    void reloadConversations();
  }, [reloadConversations]);

  useEffect(() => {
    if (!selectedAccountId) {
      return;
    }

    const interval = window.setInterval(() => {
      void reloadConversations();
    }, 5_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [reloadConversations, selectedAccountId]);

  const contextValue = useMemo(
    () => ({
      accounts,
      contacts,
      selectedAccountId,
      setSelectedAccountId,
      selectedAccount,
      conversations,
      setConversations,
      reloadConversations,
    }),
    [accounts, contacts, conversations, reloadConversations, selectedAccount, selectedAccountId],
  );

  return (
    <HomeConversationsProvider value={contextValue}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:grid md:grid-cols-[300px_minmax(0,1fr)] md:gap-5">
        <ConversationListPane
          accounts={accounts}
          selectedAccountId={selectedAccountId}
          selectedAccountLabel={selectedAccountLabel}
          selectedConversationId={selectedConversationId}
          mobileDetailOpen={mobileDetailOpen}
          conversations={conversations}
          onSelectAccount={setSelectedAccountId}
          onEditAccount={() => {
            if (!selectedAccount) {
              return;
            }

            dispatchAccountDialog({ type: 'open_edit', account: selectedAccount });
          }}
          onCreateAccount={() => {
            dispatchAccountDialog({ type: 'open_create' });
          }}
          onCreateConversation={() => {
            setConversationForm(createConversationForm());
            setConversationDialogOpen(true);
          }}
        />

        <div
          className={
            mobileDetailOpen
              ? 'flex h-full min-h-0 flex-col overflow-hidden'
              : 'hidden h-full min-h-0 flex-col overflow-hidden md:flex'
          }
        >
          <Outlet />
        </div>
      </div>

      <AccountDialog
        open={accountDialogOpen}
        mode={accountDialogMode}
        saving={accountSaving}
        form={accountForm}
        errorMessage={accountFormError}
        onOpenChange={(open) => {
          if (!open) {
            dispatchAccountDialog({ type: 'close' });
          }
        }}
        onFormChange={(nextForm) =>
          dispatchAccountDialog({
            type: 'update_form',
            updater: (current) => ({
              ...nextForm,
              slug: nextForm.slugDirty ? nextForm.slug : slugify(nextForm.displayName),
              accountId: nextForm.accountId ?? current.accountId,
            }),
          })
        }
        onDelete={async () => {
          if (!accountForm.accountId) {
            return;
          }

          await deleteInternalChatAccount(accountForm.accountId);
          dispatchData({ type: 'remove_account_by_id', accountId: accountForm.accountId });
          dispatchAccountDialog({ type: 'close' });
        }}
        onSubmit={() => {
          void (async () => {
            const payload = {
              slug: accountForm.slug.trim(),
              displayName: accountForm.displayName.trim(),
              description: accountForm.description.trim() || undefined,
            };

            dispatchAccountDialog({ type: 'set_error', error: '' });
            setAccountSaving(true);

            try {
              const account = accountForm.accountId
                ? await updateInternalChatAccount({
                    accountId: accountForm.accountId,
                    ...payload,
                  })
                : await createInternalChatAccount(payload);

              const normalizedAccount = normalizeAccount(account);

              dispatchData({ type: 'add_or_replace_account', account: normalizedAccount });
              setSelectedAccountId(normalizedAccount.accountId);
              dispatchAccountDialog({ type: 'close' });
            } catch (error) {
              dispatchAccountDialog({
                type: 'set_error',
                error: error instanceof Error ? error.message : 'Não foi possível salvar a conta.',
              });
            } finally {
              setAccountSaving(false);
            }
          })();
        }}
      />

      <NewConversationDialog
        open={conversationDialogOpen}
        selectedAccount={Boolean(selectedAccount)}
        form={conversationForm}
        contacts={availableContacts}
        onOpenChange={setConversationDialogOpen}
        onFormChange={setConversationForm}
        onSubmit={() => {
          void (async () => {
            const participants = availableContacts
              .filter((contact) =>
                conversationForm.selectedParticipantIds.includes(contact.accountId),
              )
              .map((contact) => contact.displayName);
            const conversationName =
              conversationForm.type === 'dm'
                ? (participants[0] ?? 'Nova conversa')
                : conversationForm.name.trim() || 'Novo grupo';
            const created = await createHomeInternalChatConversation({
              accountId: selectedAccountId,
              type: conversationForm.type,
              name: conversationForm.type === 'group' ? conversationName : undefined,
              participantAccountIds: conversationForm.selectedParticipantIds,
            });

            await reloadConversations();
            setConversationDialogOpen(false);
            setConversationForm(createConversationForm());
            await navigate({
              to: '/home/conversations/$conversationId',
              params: { conversationId: created.conversationId },
            });
          })();
        }}
      />
    </HomeConversationsProvider>
  );
}
