import { Link, Outlet, createFileRoute, useNavigate, useRouterState } from '@tanstack/react-router';
import { Archive, Check, ChevronRight, Pencil, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  AdminButton,
  AdminDialogBody,
  AdminDialogContent,
  AdminDialogFooter,
  AdminDialogHeader,
  AdminDialogTitle,
  AdminInput,
  AdminScrollArea,
  AdminTextarea,
} from '@/components/admin';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Dialog } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  archiveHomeInternalChatConversation,
  createHomeInternalChatConversation,
  createInternalChatAccount,
  deleteInternalChatAccount,
  getHomeInternalChatConversations,
  getInternalChatAccounts,
  getInternalChatContacts,
  type InternalChatContact,
  type InternalChatExternalAccount,
  updateInternalChatAccount,
} from '@/lib/admin-api';
import {
  formatRecentMessageTime,
  getInitials,
  HomeConversationsProvider,
  slugify,
  type AccountDialogMode,
  type AccountForm,
  type ConversationForm,
  type LocalConversation,
} from './-context';

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
  const filteredContacts = availableContacts.filter((contact) => {
    const query = conversationForm.participantQuery.trim().toLowerCase();

    if (!query) {
      return true;
    }

    return (
      contact.displayName.toLowerCase().includes(query) ||
      contact.slug.toLowerCase().includes(query)
    );
  });
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
      <div className="flex h-[calc(100dvh-16rem)] min-h-0 flex-col md:grid md:grid-cols-[280px_minmax(0,1fr)] md:gap-6">
        <div className={mobileDetailOpen ? 'hidden min-h-0 flex-col gap-3 md:flex' : 'flex min-h-0 flex-col gap-3'}>
          <section className="space-y-2">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="home-conversations-account">
                Conta
              </label>
              <div className="flex items-center gap-2">
                <Select
                  value={selectedAccountId || '__none__'}
                  onValueChange={(value) => setSelectedAccountId(value === '__none__' ? '' : value)}
                >
                  <SelectTrigger id="home-conversations-account" className="w-full">
                    <SelectValue>{selectedAccountLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Selecione uma conta</SelectItem>
                    {accounts.map((account) => (
                      <SelectItem key={account.accountId} value={account.accountId}>
                        {account.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <AdminButton
                  variant="outline"
                  size="icon-sm"
                  disabled={!selectedAccount}
                  onClick={() => {
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
                >
                  <Pencil className="h-4 w-4" />
                  <span className="sr-only">Editar conta</span>
                </AdminButton>
                <AdminButton
                  variant="outline"
                  size="icon-sm"
                  onClick={() => {
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
                >
                  <Plus className="h-4 w-4" />
                  <span className="sr-only">Nova conta</span>
                </AdminButton>
              </div>
            </div>
          </section>

          <div className="space-y-3 min-h-0 flex-1">
            <AdminButton
              variant="outline"
              className="w-full justify-center"
              disabled={!selectedAccount}
              onClick={() => {
                setConversationForm({
                  type: 'dm',
                  name: '',
                  participantQuery: '',
                  selectedParticipantIds: [],
                });
                setConversationDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Nova conversa
            </AdminButton>

            <AdminScrollArea className="h-full" contentClassName="space-y-2">
              {selectedAccount ? (
                conversations.length > 0 ? (
                  conversations.map((conversation) => {
                    const itemLatestMessage = conversation.messages.at(-1) ?? null;
                    const selected = conversation.id === selectedConversationId;
                    const avatarLabel = conversation.type === 'dm'
                      ? conversation.name
                      : conversation.name;

                    return (
                      <div key={conversation.id} className="flex items-start gap-2">
                        <Link
                          to="/home/conversations/$conversationId"
                          params={{ conversationId: conversation.id }}
                          className={
                            selected
                              ? 'block min-w-0 flex-1 rounded-sm border border-border bg-muted px-4 py-3 text-left'
                              : 'block min-w-0 flex-1 rounded-sm border border-border bg-background px-4 py-3 text-left'
                          }
                        >
                          <div className="flex items-start gap-3">
                          <Avatar className="h-9 w-9 border border-border bg-muted">
                            <AvatarFallback className="bg-muted text-xs font-medium text-foreground">
                              {getInitials(avatarLabel)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 text-sm font-medium text-foreground">
                                {conversation.name}
                              </div>
                              {itemLatestMessage ? (
                                <span className="hidden shrink-0 text-xs text-muted-foreground md:inline">
                                  {formatRecentMessageTime(itemLatestMessage.createdAt)}
                                </span>
                              ) : null}
                              <div className="flex shrink-0 items-center gap-2 md:hidden">
                                {itemLatestMessage ? (
                                  <span className="text-xs text-muted-foreground">
                                    {formatRecentMessageTime(itemLatestMessage.createdAt)}
                                  </span>
                                ) : null}
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              </div>
                            </div>
                            {conversation.type === 'group' && conversation.participants.length > 1 ? (
                              <div className="line-clamp-2 text-sm text-muted-foreground">
                                {conversation.participants.join(', ')}
                              </div>
                            ) : null}
                            {itemLatestMessage ? (
                              <div className="space-y-1 pt-2">
                                <div className="truncate text-sm text-foreground">
                                  <span className="text-muted-foreground">{itemLatestMessage.authorDisplayName}: </span>
                                  <span>{itemLatestMessage.content}</span>
                                </div>
                              </div>
                            ) : null}
                          </div>
                          </div>
                        </Link>
                        <AdminButton
                          variant="outline"
                          size="icon-sm"
                          className="mt-1 shrink-0"
                          onClick={() => {
                            if (!selectedAccount) {
                              return;
                            }

                            void (async () => {
                              await archiveHomeInternalChatConversation({
                                accountId: selectedAccount.accountId,
                                conversationId: conversation.id,
                              });

                              if (selected) {
                                await navigate({ to: '/home/conversations' });
                              }

                              await reloadConversations();
                            })();
                          }}
                        >
                          <Archive className="h-4 w-4" />
                          <span className="sr-only">Arquivar conversa</span>
                        </AdminButton>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-sm border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
                    Nenhuma conversa ainda.
                  </div>
                )
              ) : (
                <div className="rounded-sm border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
                  Selecione uma conta para abrir as conversas.
                </div>
              )}
            </AdminScrollArea>
          </div>
        </div>

        <div className={mobileDetailOpen ? 'flex h-full min-h-0 flex-col' : 'hidden h-full min-h-0 flex-col md:flex'}>
          <Outlet />
        </div>
      </div>

      <Dialog open={accountDialogOpen} onOpenChange={setAccountDialogOpen}>
        <AdminDialogContent>
          <AdminDialogHeader>
            <AdminDialogTitle>{accountDialogMode === 'edit' ? 'Editar conta' : 'Nova conta'}</AdminDialogTitle>
          </AdminDialogHeader>

          <form
            className="flex flex-col"
            onSubmit={async (event) => {
              event.preventDefault();

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
                  const nextContact: InternalChatContact = {
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
            }}
          >
            <AdminDialogBody>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="internal-chat-account-name">
                  Nome
                </label>
                <AdminInput
                  id="internal-chat-account-name"
                  value={accountForm.displayName}
                  onChange={(event) =>
                    setAccountForm((current) => ({
                      ...current,
                      displayName: event.target.value,
                      slug: current.slugDirty ? current.slug : slugify(event.target.value),
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="internal-chat-account-slug">
                  Usuário
                </label>
                <AdminInput
                  id="internal-chat-account-slug"
                  value={accountForm.slug}
                  disabled={accountDialogMode === 'edit'}
                  onChange={(event) =>
                    setAccountForm((current) => ({
                      ...current,
                      slug: event.target.value,
                      slugDirty: true,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="internal-chat-account-description">
                  Descrição
                </label>
                <AdminTextarea
                  id="internal-chat-account-description"
                  rows={4}
                  value={accountForm.description}
                  onChange={(event) => setAccountForm((current) => ({ ...current, description: event.target.value }))}
                />
              </div>
              {accountFormError ? (
                <div className="text-sm text-destructive">{accountFormError}</div>
              ) : null}
            </AdminDialogBody>
            <AdminDialogFooter>
              {accountDialogMode === 'edit' && accountForm.accountId ? (
                <AdminButton
                  type="button"
                  variant="outline"
                  className="mr-auto"
                  onClick={async () => {
                    await deleteInternalChatAccount(accountForm.accountId as string);
                    setAccounts((current) => current.filter((item) => item.accountId !== accountForm.accountId));
                    setContacts((current) => current.filter((item) => item.accountId !== accountForm.accountId));
                    setSelectedAccountId('');
                    setAccountDialogOpen(false);
                  }}
                >
                  Excluir
                </AdminButton>
              ) : null}
              <AdminButton
                type="submit"
                disabled={!accountForm.slug.trim() || !accountForm.displayName.trim() || accountSaving}
              >
                {accountSaving ? 'Salvando...' : 'Salvar'}
              </AdminButton>
            </AdminDialogFooter>
          </form>
        </AdminDialogContent>
      </Dialog>

      <Dialog open={conversationDialogOpen} onOpenChange={setConversationDialogOpen}>
        <AdminDialogContent>
          <AdminDialogHeader>
            <AdminDialogTitle>Nova conversa</AdminDialogTitle>
          </AdminDialogHeader>

          <form
            className="flex flex-col"
            onSubmit={(event) => {
              event.preventDefault();

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
          >
            <AdminDialogBody>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="internal-chat-conversation-type">
                  Tipo
                </label>
                <Select
                  value={conversationForm.type}
                  onValueChange={(value: 'dm' | 'group') =>
                    setConversationForm((current) => ({
                      ...current,
                      type: value,
                      selectedParticipantIds: [],
                    }))
                  }
                >
                  <SelectTrigger id="internal-chat-conversation-type" className="w-full">
                    <SelectValue>{conversationForm.type === 'dm' ? 'DM' : 'Grupo'}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dm">DM</SelectItem>
                    <SelectItem value="group">Grupo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {conversationForm.type === 'group' ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="internal-chat-conversation-name">
                    Nome do grupo
                  </label>
                  <AdminInput
                    id="internal-chat-conversation-name"
                    value={conversationForm.name}
                    onChange={(event) => setConversationForm((current) => ({ ...current, name: event.target.value }))}
                  />
                </div>
              ) : null}

              <div className="space-y-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="internal-chat-conversation-participant-filter">
                    Participantes
                  </label>
                  <AdminInput
                    id="internal-chat-conversation-participant-filter"
                    value={conversationForm.participantQuery}
                    onChange={(event) =>
                      setConversationForm((current) => ({ ...current, participantQuery: event.target.value }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  {filteredContacts.length > 0 ? (
                    filteredContacts.map((contact) => {
                      const selected = conversationForm.selectedParticipantIds.includes(contact.accountId);

                      return (
                        <button
                          key={contact.accountId}
                          type="button"
                          onClick={() =>
                            setConversationForm((current) => ({
                              ...current,
                              selectedParticipantIds:
                                current.type === 'dm'
                                  ? [contact.accountId]
                                  : selected
                                    ? current.selectedParticipantIds.filter((value) => value !== contact.accountId)
                                    : [...current.selectedParticipantIds, contact.accountId],
                            }))
                          }
                          className={
                            selected
                              ? 'flex w-full items-center gap-3 rounded-sm border border-border bg-muted px-3 py-3 text-left'
                              : 'flex w-full items-center gap-3 rounded-sm border border-border bg-background px-3 py-3 text-left'
                          }
                        >
                          <Avatar className="h-9 w-9 border border-border bg-muted">
                            <AvatarFallback className="bg-muted text-xs font-medium text-foreground">
                              {getInitials(contact.displayName)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 space-y-0.5">
                            <div className="truncate text-sm font-medium text-foreground">{contact.displayName}</div>
                            <div className="truncate text-xs text-muted-foreground">@{contact.slug}</div>
                          </div>
                          <div className="ml-auto text-muted-foreground">
                            {selected ? <Check className="h-4 w-4" /> : null}
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="text-sm text-muted-foreground">Nenhum participante encontrado.</div>
                  )}
                </div>
              </div>
            </AdminDialogBody>

            <AdminDialogFooter>
              <AdminButton
                type="submit"
                disabled={
                  !selectedAccount ||
                  (conversationForm.type === 'dm'
                    ? conversationForm.selectedParticipantIds.length !== 1
                    : conversationForm.selectedParticipantIds.length === 0)
                }
              >
                Criar
              </AdminButton>
            </AdminDialogFooter>
          </form>
        </AdminDialogContent>
      </Dialog>
    </HomeConversationsProvider>
  );
}
