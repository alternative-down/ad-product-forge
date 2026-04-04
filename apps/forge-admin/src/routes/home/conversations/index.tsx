import { createFileRoute } from '@tanstack/react-router';
import { ArrowLeft, Check, Pencil, Plus, Settings2 } from 'lucide-react';
import { useEffect, useState } from 'react';

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
import {
  createInternalChatAccount,
  getInternalChatAccounts,
  getInternalChatContacts,
  type InternalChatContact,
  type InternalChatExternalAccount,
  updateInternalChatAccount,
} from '@/lib/admin-api';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Dialog } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export const Route = createFileRoute('/home/conversations/')({
  component: HomeConversationsIndexRoute,
});

type LocalConversationMessage = {
  id: string;
  authorDisplayName: string;
  content: string;
  createdAt: number;
  attachments: Array<{
    id: string;
    name: string;
    sizeBytes: number;
  }>;
};

type LocalConversation = {
  id: string;
  type: 'dm' | 'group';
  name: string;
  participants: string[];
  updatedAt: number;
  messages: LocalConversationMessage[];
};

type AccountForm = {
  accountId?: string;
  slug: string;
  displayName: string;
  description: string;
  slugDirty: boolean;
};

type ConversationForm = {
  type: 'dm' | 'group';
  name: string;
  participantQuery: string;
  selectedParticipantIds: string[];
};

type AccountDialogMode = 'create' | 'edit';

const SELECTED_ACCOUNT_STORAGE_KEY = 'forja.home.internal-chat.selected-account-id';

export function HomeConversationsIndexRoute() {
  const [accounts, setAccounts] = useState<InternalChatExternalAccount[]>([]);
  const [contacts, setContacts] = useState<InternalChatContact[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState(() => {
    if (typeof window === 'undefined') {
      return '';
    }

    return window.localStorage.getItem(SELECTED_ACCOUNT_STORAGE_KEY) ?? '';
  });
  const [conversations, setConversations] = useState<LocalConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState('');
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [accountDialogMode, setAccountDialogMode] = useState<AccountDialogMode>('create');
  const [conversationDialogOpen, setConversationDialogOpen] = useState(false);
  const [participantsDialogOpen, setParticipantsDialogOpen] = useState(false);
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
  const [participantDraft, setParticipantDraft] = useState('');
  const [messageDraft, setMessageDraft] = useState('');
  const [attachmentDrafts, setAttachmentDrafts] = useState<File[]>([]);

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

  useEffect(() => {
    if (!selectedAccountId) {
      return;
    }

    if (accounts.some((account) => account.accountId === selectedAccountId)) {
      return;
    }

    setSelectedAccountId('');
  }, [accounts, selectedAccountId]);

  const selectedAccount = accounts.find((account) => account.accountId === selectedAccountId) ?? null;
  const selectedConversation = conversations.find((conversation) => conversation.id === selectedConversationId) ?? null;
  const selectedAccountLabel = selectedAccount?.displayName ?? 'Selecione uma conta';
  const availableContacts = contacts.filter((contact) => contact.isAgent && contact.accountId !== selectedAccountId);
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

  const selectedConversationMessages = selectedConversation?.messages ?? [];

  return (
    <div className="min-w-0 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <section className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0 flex-1 space-y-2">
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
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <AdminButton
              variant="outline"
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
              Nova conta
            </AdminButton>
          </div>
        </div>
      </section>

      <div className="flex h-[calc(100dvh-16rem)] min-h-0 flex-col md:grid md:grid-cols-[280px_minmax(0,1fr)] md:gap-6">
        <div className={selectedConversation ? 'hidden min-h-0 flex-col gap-3 md:flex' : 'flex min-h-0 flex-col gap-3'}>
          <AdminButton
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

                  return (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => setSelectedConversationId(conversation.id)}
                      className={
                        selected
                          ? 'block w-full rounded-sm border border-border bg-muted px-4 py-3 text-left'
                          : 'block w-full rounded-sm border border-border bg-background px-4 py-3 text-left'
                      }
                    >
                      <div className="space-y-1">
                        <div className="text-sm font-medium text-foreground">
                          {conversation.name}
                        </div>
                        {conversation.type === 'group' && conversation.participants.length > 1 ? (
                          <div className="line-clamp-2 text-sm text-muted-foreground">
                            {conversation.participants.join(', ')}
                          </div>
                        ) : null}
                        {itemLatestMessage ? (
                          <div className="truncate text-sm text-muted-foreground">
                            {itemLatestMessage.authorDisplayName}: {itemLatestMessage.content}
                          </div>
                        ) : null}
                      </div>
                    </button>
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

        <div className={selectedConversation ? 'flex min-h-0 flex-col gap-4' : 'hidden min-h-0 flex-col gap-4 md:flex'}>
          {selectedConversation ? (
            <>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedConversationId('')}
                    className="text-muted-foreground md:hidden"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span className="sr-only">Voltar</span>
                  </button>
                  <div className="text-base font-semibold tracking-[-0.03em]">{selectedConversation.name}</div>
                </div>
                {selectedConversation.type === 'group' ? (
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-sm text-muted-foreground">
                      {selectedConversation.participants.length > 0
                        ? selectedConversation.participants.join(', ')
                        : 'Sem participantes.'}
                    </div>
                    <AdminButton
                      variant="outline"
                      size="icon-sm"
                      onClick={() => setParticipantsDialogOpen(true)}
                    >
                      <Settings2 className="h-4 w-4" />
                      <span className="sr-only">Participantes</span>
                    </AdminButton>
                  </div>
                ) : null}
              </div>

              <div className="min-h-0 flex-1">
                <AdminScrollArea className="h-full" contentClassName="space-y-3">
                  {selectedConversationMessages.map((message) => (
                    <article key={message.id} className="flex items-start gap-3 py-1">
                      <Avatar className="h-9 w-9 border border-border bg-muted">
                        <AvatarFallback className="bg-muted text-xs font-medium text-foreground">
                          {getInitials(message.authorDisplayName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-medium text-foreground">{message.authorDisplayName}</span>
                          <span className="text-xs text-muted-foreground">{formatRecentMessageTime(message.createdAt)}</span>
                        </div>
                        <div className="whitespace-pre-wrap text-sm leading-6 text-foreground">{message.content}</div>
                        {message.attachments.length > 0 ? (
                          <div className="text-xs text-muted-foreground">
                            {message.attachments.map((attachment) => attachment.name).join(', ')}
                          </div>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </AdminScrollArea>
              </div>

              <section className="space-y-3 border-t border-border pt-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="home-conversations-message">
                    Mensagem
                  </label>
                  <AdminTextarea
                    id="home-conversations-message"
                    rows={4}
                    value={messageDraft}
                    onChange={(event) => setMessageDraft(event.target.value)}
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="text-sm text-muted-foreground">
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(event) => setAttachmentDrafts(Array.from(event.target.files ?? []))}
                    />
                    <span className="cursor-pointer">Adicionar anexos</span>
                  </label>
                  <AdminButton
                    disabled={!selectedAccount || !selectedConversation || !messageDraft.trim()}
                    onClick={() => {
                      if (!selectedAccount || !selectedConversation || !messageDraft.trim()) {
                        return;
                      }

                      setConversations((current) =>
                        current.map((conversation) =>
                          conversation.id === selectedConversation.id
                            ? {
                                ...conversation,
                                updatedAt: Date.now(),
                                messages: [
                                  ...conversation.messages,
                                  {
                                    id: createLocalId('msg'),
                                    authorDisplayName: selectedAccount.displayName,
                                    content: messageDraft.trim(),
                                    createdAt: Date.now(),
                                    attachments: attachmentDrafts.map((file) => ({
                                      id: createLocalId('att'),
                                      name: file.name,
                                      sizeBytes: file.size,
                                    })),
                                  },
                                ],
                              }
                            : conversation,
                        ),
                      );
                      setMessageDraft('');
                      setAttachmentDrafts([]);
                    }}
                  >
                    Enviar
                  </AdminButton>
                </div>

                {attachmentDrafts.length > 0 ? (
                  <div className="text-xs text-muted-foreground">
                    {attachmentDrafts.map((file) => file.name).join(', ')}
                  </div>
                ) : null}
              </section>
            </>
          ) : (
            <div className="flex h-full min-h-0 items-center justify-center text-sm text-muted-foreground">
              Selecione uma conversa.
            </div>
          )}
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

              const participants = availableContacts
                .filter((contact) => conversationForm.selectedParticipantIds.includes(contact.accountId))
                .map((contact) => contact.displayName);

              const conversationName =
                conversationForm.type === 'dm'
                  ? participants[0] ?? 'Nova conversa'
                  : conversationForm.name.trim() || 'Novo grupo';

              const conversation: LocalConversation = {
                id: createLocalId('conv'),
                type: conversationForm.type,
                name: conversationName,
                participants,
                updatedAt: Date.now(),
                messages: [],
              };

              setConversations((current) => [conversation, ...current]);
              setSelectedConversationId(conversation.id);
              setConversationDialogOpen(false);
              setConversationForm({
                type: 'dm',
                name: '',
                participantQuery: '',
                selectedParticipantIds: [],
              });
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
                    setConversationForm((current) => ({ ...current, type: value }))
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

      <Dialog open={participantsDialogOpen} onOpenChange={setParticipantsDialogOpen}>
        <AdminDialogContent>
          <AdminDialogHeader>
            <AdminDialogTitle>Participantes</AdminDialogTitle>
          </AdminDialogHeader>

          {selectedConversation ? (
            <form
              className="flex flex-col"
              onSubmit={(event) => {
                event.preventDefault();

                const value = participantDraft.trim();

                if (!value) {
                  return;
                }

                setConversations((current) =>
                  current.map((conversation) =>
                    conversation.id === selectedConversation.id && !conversation.participants.includes(value)
                      ? {
                          ...conversation,
                          participants: [...conversation.participants, value],
                        }
                      : conversation,
                  ),
                );
                setParticipantDraft('');
              }}
            >
              <AdminDialogBody>
                <div className="flex items-end gap-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    <label className="text-sm font-medium" htmlFor="internal-chat-manage-participant">
                      Participante
                    </label>
                    <AdminInput
                      id="internal-chat-manage-participant"
                      value={participantDraft}
                      onChange={(event) => setParticipantDraft(event.target.value)}
                    />
                  </div>
                  <AdminButton type="submit">Incluir</AdminButton>
                </div>

                <div className="space-y-2">
                  {selectedConversation.participants.length > 0 ? (
                    selectedConversation.participants.map((participant) => (
                      <div key={participant} className="flex items-center justify-between gap-3 border-b border-border pb-2">
                        <AdminInput
                          value={participant}
                          onChange={(event) =>
                            setConversations((current) =>
                              current.map((conversation) =>
                                conversation.id === selectedConversation.id
                                  ? {
                                      ...conversation,
                                      participants: conversation.participants.map((value) =>
                                        value === participant ? event.target.value : value,
                                      ),
                                    }
                                  : conversation,
                              ),
                            )
                          }
                        />
                        <AdminButton
                          type="button"
                          variant="outline"
                          onClick={() =>
                            setConversations((current) =>
                              current.map((conversation) =>
                                conversation.id === selectedConversation.id
                                  ? {
                                      ...conversation,
                                      participants: conversation.participants.filter((value) => value !== participant),
                                    }
                                  : conversation,
                              ),
                            )
                          }
                        >
                          Remover
                        </AdminButton>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-muted-foreground">Nenhum participante.</div>
                  )}
                </div>
              </AdminDialogBody>
              <AdminDialogFooter>
                <AdminButton type="button" onClick={() => setParticipantsDialogOpen(false)}>
                  Fechar
                </AdminButton>
              </AdminDialogFooter>
            </form>
          ) : null}
        </AdminDialogContent>
      </Dialog>

    </div>
  );
}

function createLocalId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '');
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return '??';
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function formatRecentMessageTime(value: number) {
  const diffMs = Date.now() - value;
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays >= 3) {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
    }).format(value);
  }

  if (diffMs < 60 * 1000) {
    return 'agora';
  }

  if (diffMs < 60 * 60 * 1000) {
    return `${Math.max(1, Math.floor(diffMs / (60 * 1000)))} min`;
  }

  if (diffMs < 24 * 60 * 60 * 1000) {
    return `${Math.floor(diffMs / (60 * 60 * 1000))} h`;
  }

  return `${Math.floor(diffDays)} d`;
}
