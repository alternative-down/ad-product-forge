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

export const Route = createFileRoute('/home/conversations')({
  component: HomeConversationsLayoutRoute,
});

const SELECTED_ACCOUNT_STORAGE_KEY = 'forja.home.internal-chat.selected-account-id';

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
    accountId: undefined,
    slug: '',
    displayName: '',
    description: '',
    slugDirty: false,
  });
  const [conversationForm, setConversationForm] = useState<ConversationForm>({
    type: 'dm',
    name: '',
    participantQuery: '',
    selectedParticipantIds: [],
  });

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

      setConversations(items.map((conversation) => ({
        id: conversation.conversationId,
        type: conversation.type,
        name: conversation.name,
        participants: conversation.participants,
        updatedAt: conversation.updatedAt,
        messages: conversation.messages.map((message) => ({
          id: message.messageId,
          authorDisplayName: message.authorDisplayName,
          content: message.content,
          createdAt: message.createdAt,
          attachments: [],
        })),
      })));
    } catch (error) {
      console.error('[HomeConversations] Failed to load conversations:', error);
      setConversations([]);
    }
  }, [selectedAccountId]);

  useEffect(() => {
    void reloadConversations();
  }, [reloadConversations]);

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
      <div className="flex h-[calc(100dvh-12rem)] min-h-0 flex-col md:grid md:grid-cols-[280px_minmax(0,1fr)] md:gap-6">
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
            setAccountForm({
              accountId: selectedAccount.accountId,
              slug: selectedAccount.slug,
              displayName: selectedAccount.displayName,
              description: selectedAccount.description,
              slugDirty: true,
            });
            setAccountDialogOpen(true);
          }}
          onCreateAccount={() => {
            setAccountDialogMode('create');
            setAccountFormError('');
            setAccountForm({
              accountId: undefined,
              slug: '',
              displayName: '',
              description: '',
              slugDirty: false,
            });
            setAccountDialogOpen(true);
          }}
          onCreateConversation={() => {
            setConversationForm({
              type: 'dm',
              name: '',
              participantQuery: '',
              selectedParticipantIds: [],
            });
            setConversationDialogOpen(true);
          }}
        />

        <div className={mobileDetailOpen ? 'flex h-full min-h-0 flex-col' : 'hidden h-full min-h-0 flex-col md:flex'}>
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

              const normalizedAccount: InternalChatExternalAccount = {
                accountId: account.accountId,
                slug: account.slug,
                displayName: account.displayName,
                description: account.description ?? '',
              };

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
              setAccountForm({
                accountId: undefined,
                slug: '',
                displayName: '',
                description: '',
                slugDirty: false,
              });
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
            setConversationForm({
              type: 'dm',
              name: '',
              participantQuery: '',
              selectedParticipantIds: [],
            });
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
