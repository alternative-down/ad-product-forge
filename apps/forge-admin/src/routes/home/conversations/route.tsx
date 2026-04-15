import { Outlet, createFileRoute, useNavigate, useRouterState } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  createHomeInternalChatConversation,
  createInternalChatAccount,
  deleteInternalChatAccount,
  getHomeInternalChatConversations,
  getInternalChatAccounts,
  getInternalChatContacts,
  type InternalChatExternalAccount,
  updateInternalChatAccount,
} from '@/lib/admin-api';
import {
  HomeConversationsProvider,
  slugify,
  type AccountDialogMode,
  type AccountForm,
  type ConversationForm,
  type LocalConversation,
} from './-context';
import { AccountDialog } from './-account-dialog';
import { ConversationListPane } from './-conversation-list-pane';
import { NewConversationDialog } from './-new-conversation-dialog';
import {
  createAccountForm,
  createConversationForm,
  createEmptyAccountForm,
  normalizeAccount,
  normalizeConversations,
  SELECTED_ACCOUNT_STORAGE_KEY,
} from './-route-helpers';

export const Route = createFileRoute('/home/conversations')({
  component: HomeConversationsLayoutRoute,
});

function HomeConversationsLayoutRoute() {
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const [accounts, setAccounts] = useState<InternalChatExternalAccount[]>([]);
  const [contacts, setContacts] = useState<InternalChatContact[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState(() => {
    if (typeof window === 'undefined') {
      return '';
    }

    return window.localStorage.getItem(SELECTED_ACCOUNT_STORAGE_KEY) ?? '';
  });
  const [conversations, setConversations] = useState<LocalConversation[]>([]);
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [accountDialogMode, setAccountDialogMode] = useState<AccountDialogMode>('create');
  const [conversationDialogOpen, setConversationDialogOpen] = useState(false);
  const [accountFormError, setAccountFormError] = useState('');
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountForm, setAccountForm] = useState<AccountForm>({
    ...createEmptyAccountForm(),
  });
  const [conversationForm, setConversationForm] = useState<ConversationForm>(createConversationForm);

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
        console.error('[HomeConversations] Failed to load internal chat accounts:', error);
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

  const selectedAccount = accounts.find((account) => account.accountId === selectedAccountId) ?? null;
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
      console.error('[HomeConversations] Failed to load conversations:', error);
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

  const contextValue = useMemo(() => ({
    accounts,
    contacts,
    selectedAccountId,
    setSelectedAccountId,
    selectedAccount,
    conversations,
    setConversations,
    reloadConversations,
  }), [accounts, contacts, conversations, reloadConversations, selectedAccount, selectedAccountId]);

  return (
    <HomeConversationsProvider value={contextValue}>
      <div className="flex h-[calc(100dvh-10.5rem)] min-h-0 flex-1 flex-col overflow-hidden md:grid md:grid-cols-[300px_minmax(0,1fr)] md:gap-5">
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

            setAccountDialogMode('edit');
            setAccountFormError('');
            setAccountForm(createAccountForm(selectedAccount));
            setAccountDialogOpen(true);
          }}
          onCreateAccount={() => {
            setAccountDialogMode('create');
            setAccountFormError('');
            setAccountForm(createEmptyAccountForm());
            setAccountDialogOpen(true);
          }}
          onCreateConversation={() => {
            setConversationForm(createConversationForm());
            setConversationDialogOpen(true);
          }}
        />

        <div className={mobileDetailOpen ? 'flex h-full min-h-0 flex-col overflow-hidden' : 'hidden h-full min-h-0 flex-col overflow-hidden md:flex'}>
          <Outlet />
        </div>
      </div>

      <AccountDialog
        open={accountDialogOpen}
        mode={accountDialogMode}
        saving={accountSaving}
        form={accountForm}
        errorMessage={accountFormError}
        onOpenChange={setAccountDialogOpen}
        onFormChange={(nextForm) =>
          setAccountForm((current) => ({
            ...nextForm,
            slug: nextForm.slugDirty ? nextForm.slug : slugify(nextForm.displayName),
            accountId: nextForm.accountId ?? current.accountId,
          }))
        }
        onDelete={async () => {
          if (!accountForm.accountId) {
            return;
          }

          await deleteInternalChatAccount(accountForm.accountId);
          setAccounts((current) => current.filter((item) => item.accountId !== accountForm.accountId));
          setContacts((current) => current.filter((item) => item.accountId !== accountForm.accountId));
          setSelectedAccountId('');
          setAccountDialogOpen(false);
        }}
        onSubmit={() => {
          void (async () => {
            const payload = {
              slug: accountForm.slug.trim(),
              displayName: accountForm.displayName.trim(),
              description: accountForm.description.trim() || undefined,
            };

            setAccountFormError('');
            setAccountSaving(true);

            try {
              const account = accountForm.accountId
                ? await updateInternalChatAccount({
                    accountId: accountForm.accountId,
                    ...payload,
                  })
                : await createInternalChatAccount(payload);

              const normalizedAccount = normalizeAccount(account);

              setAccounts((current) =>
                accountForm.accountId
                  ? current.map((item) => (item.accountId === normalizedAccount.accountId ? normalizedAccount : item))
                  : [...current, normalizedAccount].sort((left, right) => left.displayName.localeCompare(right.displayName)),
              );
              setContacts((current) => {
                const nextContact = {
                  ...normalizedAccount,
                  isAgent: false,
                };

                return accountForm.accountId
                  ? current.map((item) => (item.accountId === nextContact.accountId ? nextContact : item))
                  : [...current, nextContact].sort((left, right) => left.displayName.localeCompare(right.displayName));
              });
              setSelectedAccountId(normalizedAccount.accountId);
              setAccountDialogOpen(false);
              setAccountForm(createEmptyAccountForm());
            } catch (error) {
              setAccountFormError(error instanceof Error ? error.message : 'Não foi possível salvar a conta.');
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
              .filter((contact) => conversationForm.selectedParticipantIds.includes(contact.accountId))
              .map((contact) => contact.displayName);
            const conversationName =
              conversationForm.type === 'dm'
                ? participants[0] ?? 'Nova conversa'
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
