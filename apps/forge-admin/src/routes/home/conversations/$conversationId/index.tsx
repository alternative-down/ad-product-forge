import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { Archive, ArrowDown, ArrowLeft, Check, Pencil, SendHorizontal, Settings2, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

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
import { Switch } from '@/components/ui/switch';
import {
  addHomeInternalChatGroupMember,
  archiveHomeInternalChatConversation,
  getHomeInternalChatAttachmentBlob,
  getHomeInternalChatGroupMembers,
  getHomeInternalChatMessages,
  removeHomeInternalChatGroupMember,
  sendHomeInternalChatMessage,
  updateHomeInternalChatConversation,
  updateHomeInternalChatGroupMemberRole,
  type HomeInternalChatConversationMessage,
  type HomeInternalChatGroupMember,
} from '@/lib/admin-api';
import { formatRecentMessageTime, getInitials, useHomeConversations } from '../-context';

export const Route = createFileRoute('/home/conversations/$conversationId/')({
  component: HomeConversationDetailIndexRoute,
});

function encodeArrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';

  for (let index = 0; index < bytes.length; index += 0x8000) {
    const chunk = bytes.subarray(index, index + 0x8000);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function isImageAttachment(contentType?: string) {
  return Boolean(contentType?.startsWith('image/'));
}

function HomeConversationDetailIndexRoute() {
  const navigate = useNavigate();
  const { conversationId } = Route.useParams();
  const { contacts, conversations, selectedAccount, reloadConversations } = useHomeConversations();
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const initialScrollDoneRef = useRef(false);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const [participantsDialogOpen, setParticipantsDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [groupNameDraft, setGroupNameDraft] = useState('');
  const [availableParticipantId, setAvailableParticipantId] = useState('');
  const [availableParticipantRole, setAvailableParticipantRole] = useState<'admin' | 'normal'>('normal');
  const [messageDraft, setMessageDraft] = useState('');
  const [attachmentDrafts, setAttachmentDrafts] = useState<File[]>([]);
  const [messages, setMessages] = useState<HomeInternalChatConversationMessage[]>([]);
  const [members, setMembers] = useState<HomeInternalChatGroupMember[]>([]);
  const selectedConversation = conversations.find((conversation) => conversation.id === decodeURIComponent(conversationId)) ?? null;
  const selectedAccountId = selectedAccount?.accountId ?? '';
  const selectedConversationId = selectedConversation?.id ?? '';
  const selectedConversationType = selectedConversation?.type ?? 'dm';
  const selectedConversationName = selectedConversation?.name ?? '';
  const contactByAccountId = useMemo(
    () => new Map(contacts.map((contact) => [contact.accountId, contact])),
    [contacts],
  );
  const availableParticipants = useMemo(() => {
    const memberIds = new Set(members.map((member) => member.participantId));

    return contacts.filter((contact) => !memberIds.has(contact.accountId));
  }, [contacts, members]);

  useEffect(() => {
    if (!selectedAccountId || !selectedConversationId) {
      return;
    }

    let cancelled = false;

    async function loadConversationState() {
      const [messageResult, memberResult] = await Promise.all([
        getHomeInternalChatMessages(selectedAccountId, selectedConversationId, 100, 0),
        selectedConversationType === 'group'
          ? getHomeInternalChatGroupMembers(selectedAccountId, selectedConversationId)
          : Promise.resolve([]),
      ]);

      if (!cancelled) {
        setMessages(messageResult.items);
        setMembers(memberResult);
        setGroupNameDraft(selectedConversationName);
        setAutoScrollEnabled(true);
      }
    }

    void loadConversationState();

    return () => {
      cancelled = true;
    };
  }, [
    selectedAccountId,
    selectedConversationId,
    selectedConversationName,
    selectedConversationType,
  ]);

  useEffect(() => {
    initialScrollDoneRef.current = false;
  }, [selectedConversationId]);

  useEffect(() => {
    if (!selectedAccountId || !selectedConversationId) {
      return;
    }

    const interval = window.setInterval(() => {
      void (async () => {
        const messageResult = await getHomeInternalChatMessages(
          selectedAccountId,
          selectedConversationId,
          100,
          0,
        );

        setMessages(messageResult.items);
        await reloadConversations();

        if (autoScrollEnabled) {
          requestAnimationFrame(() => {
            const nextViewport = scrollAreaRef.current?.querySelector('[data-slot=scroll-area-viewport]');

            if (nextViewport instanceof HTMLDivElement) {
              nextViewport.scrollTop = nextViewport.scrollHeight;
            }
          });
        }
      })();
    }, 500);

    return () => {
      window.clearInterval(interval);
    };
  }, [autoScrollEnabled, reloadConversations, selectedAccountId, selectedConversationId]);

  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector('[data-slot=scroll-area-viewport]');

    if (!(viewport instanceof HTMLDivElement)) {
      return;
    }

    function handleScroll() {
      const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      setAutoScrollEnabled(distanceFromBottom <= 8);
    }

    viewport.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      viewport.removeEventListener('scroll', handleScroll);
    };
  }, [selectedConversationId, messages.length]);

  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector('[data-slot=scroll-area-viewport]');

    if (!(viewport instanceof HTMLDivElement) || initialScrollDoneRef.current || messages.length === 0) {
      return;
    }

    viewport.scrollTop = viewport.scrollHeight;
    initialScrollDoneRef.current = true;
  }, [messages]);

  if (!selectedConversation) {
    return <div className="text-sm text-muted-foreground">Conversa não encontrada.</div>;
  }

  return (
    <>
      <div className="flex h-full min-h-0 flex-col gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void navigate({ to: '/home/conversations' })}
              className="text-muted-foreground md:hidden"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Voltar</span>
            </button>
            <div className="text-base font-semibold tracking-[-0.03em]">{selectedConversation.name}</div>
            {selectedConversation.type === 'group' ? (
              <AdminButton variant="outline" size="icon-sm" onClick={() => setRenameDialogOpen(true)}>
                <Pencil className="h-4 w-4" />
                <span className="sr-only">Editar nome da conversa</span>
              </AdminButton>
            ) : null}
            <AdminButton
              variant="outline"
              size="icon-sm"
              onClick={() => {
                if (!selectedAccount) {
                  return;
                }

                void (async () => {
                  await archiveHomeInternalChatConversation({
                    accountId: selectedAccount.accountId,
                    conversationId: selectedConversation.id,
                  });
                  await reloadConversations();
                  await navigate({ to: '/home/conversations' });
                })();
              }}
            >
              <Archive className="h-4 w-4" />
              <span className="sr-only">Arquivar conversa</span>
            </AdminButton>
          </div>
          {selectedConversation.type === 'group' ? (
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm text-muted-foreground">
                {members.length > 0
                  ? members.map((member) => member.participantName).join(', ')
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

        <div ref={scrollAreaRef} className="relative min-h-0 flex-1">
          <AdminScrollArea className="h-full" contentClassName="space-y-3">
            {messages.map((message) => {
              const authorContact = contactByAccountId.get(message.authorAccountId);

              return (
                <article key={message.messageId} className="flex items-start gap-3 py-1">
                  {authorContact?.agentId ? (
                    <Link
                      to="/agents/$agentId"
                      params={{ agentId: authorContact.agentId }}
                      className="shrink-0"
                    >
                      <Avatar className="h-9 w-9 border border-border bg-muted">
                        <AvatarFallback className="bg-muted text-xs font-medium text-foreground">
                          {getInitials(message.authorDisplayName)}
                        </AvatarFallback>
                      </Avatar>
                    </Link>
                  ) : (
                    <Avatar className="h-9 w-9 border border-border bg-muted">
                      <AvatarFallback className="bg-muted text-xs font-medium text-foreground">
                        {getInitials(message.authorDisplayName)}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium text-foreground">{message.authorDisplayName}</span>
                      <span className="text-xs text-muted-foreground">{formatRecentMessageTime(message.createdAt)}</span>
                    </div>
                    <div className="whitespace-pre-wrap text-sm leading-6 text-foreground">{message.content}</div>
                    {message.attachments.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {message.attachments.map((attachment) => (
                          <ConversationAttachment
                            key={`${message.messageId}:${attachment.name}`}
                            accountId={selectedAccount?.accountId ?? ''}
                            conversationId={selectedConversation.id}
                            messageId={message.messageId}
                            attachment={attachment}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </AdminScrollArea>
          {!autoScrollEnabled ? (
            <AdminButton
              variant="outline"
              size="icon-sm"
              className="absolute bottom-3 right-1"
              onClick={() => {
                const viewport = scrollAreaRef.current?.querySelector('[data-slot=scroll-area-viewport]');

                if (!(viewport instanceof HTMLDivElement)) {
                  return;
                }

                viewport.scrollTop = viewport.scrollHeight;
                setAutoScrollEnabled(true);
              }}
            >
              <ArrowDown className="h-4 w-4" />
              <span className="sr-only">Ir para o final</span>
            </AdminButton>
          ) : null}
        </div>

        <section className="space-y-3 border-t border-border pt-4">
          <AdminTextarea
            id="home-conversations-message"
            rows={4}
            value={messageDraft}
            onChange={(event) => setMessageDraft(event.target.value)}
          />

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
              size="icon-sm"
              disabled={!selectedAccount || (!messageDraft.trim() && attachmentDrafts.length === 0)}
              onClick={() => {
                if (!selectedAccount || (!messageDraft.trim() && attachmentDrafts.length === 0)) {
                  return;
                }

                void (async () => {
                  const attachments = await Promise.all(
                    attachmentDrafts.map(async (file) => ({
                      name: file.name,
                      contentType: file.type || undefined,
                      dataBase64: encodeArrayBufferToBase64(await file.arrayBuffer()),
                    })),
                  );

                  await sendHomeInternalChatMessage({
                    accountId: selectedAccount.accountId,
                    conversationId: selectedConversation.id,
                    content: messageDraft.trim(),
                    attachments,
                  });

                  const messageResult = await getHomeInternalChatMessages(
                    selectedAccount.accountId,
                    selectedConversation.id,
                    100,
                    0,
                  );

                  setMessages(messageResult.items);
                  setMessageDraft('');
                  setAttachmentDrafts([]);
                  setAutoScrollEnabled(true);
                  requestAnimationFrame(() => {
                    const viewport = scrollAreaRef.current?.querySelector('[data-slot=scroll-area-viewport]');

                    if (viewport instanceof HTMLDivElement) {
                      viewport.scrollTop = viewport.scrollHeight;
                    }
                  });
                  await reloadConversations();
                })();
              }}
            >
              <SendHorizontal className="h-4 w-4" />
              <span className="sr-only">Enviar</span>
            </AdminButton>
          </div>

          {attachmentDrafts.length > 0 ? (
            <div className="text-xs text-muted-foreground">
              {attachmentDrafts.map((file) => file.name).join(', ')}
            </div>
          ) : null}
        </section>
      </div>

      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <AdminDialogContent>
          <AdminDialogHeader>
            <AdminDialogTitle>Editar conversa</AdminDialogTitle>
          </AdminDialogHeader>
          <form
            className="flex flex-col"
            onSubmit={(event) => {
              event.preventDefault();

              if (!selectedAccount || !groupNameDraft.trim()) {
                return;
              }

              void (async () => {
                await updateHomeInternalChatConversation({
                  accountId: selectedAccount.accountId,
                  conversationId: selectedConversation.id,
                  name: groupNameDraft.trim(),
                });
                await reloadConversations();
                setRenameDialogOpen(false);
              })();
            }}
          >
            <AdminDialogBody>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="home-conversation-name">
                  Nome do grupo
                </label>
                <AdminInput
                  id="home-conversation-name"
                  value={groupNameDraft}
                  onChange={(event) => setGroupNameDraft(event.target.value)}
                />
              </div>
            </AdminDialogBody>
            <AdminDialogFooter>
              <AdminButton type="submit">Salvar</AdminButton>
            </AdminDialogFooter>
          </form>
        </AdminDialogContent>
      </Dialog>

      {selectedConversation.type === 'group' ? (
        <Dialog open={participantsDialogOpen} onOpenChange={setParticipantsDialogOpen}>
          <AdminDialogContent>
            <AdminDialogHeader>
              <AdminDialogTitle>Participantes</AdminDialogTitle>
            </AdminDialogHeader>

            <form
              className="flex flex-col"
              onSubmit={(event) => {
                event.preventDefault();

                if (!selectedAccount || !availableParticipantId) {
                  return;
                }

                void (async () => {
                  const nextMembers = await addHomeInternalChatGroupMember({
                    accountId: selectedAccount.accountId,
                    conversationId: selectedConversation.id,
                    participantAccountId: availableParticipantId,
                    role: availableParticipantRole,
                  });

                  setMembers(nextMembers);
                  setAvailableParticipantId('');
                  setAvailableParticipantRole('normal');
                  await reloadConversations();
                })();
              }}
            >
              <AdminDialogBody>
                <div className="flex items-end gap-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    <label className="text-sm font-medium" htmlFor="internal-chat-manage-participant">
                      Participante
                    </label>
                    <Select
                      value={availableParticipantId || '__none__'}
                      onValueChange={(value) => setAvailableParticipantId(value === '__none__' ? '' : value)}
                    >
                      <SelectTrigger id="internal-chat-manage-participant" className="w-full">
                        <SelectValue>
                          {availableParticipants.find((participant) => participant.accountId === availableParticipantId)?.displayName ?? 'Selecione um participante'}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Selecione um participante</SelectItem>
                        {availableParticipants.map((participant) => (
                          <SelectItem key={participant.accountId} value={participant.accountId}>
                            {participant.displayName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="internal-chat-manage-participant-role">
                      Admin
                    </label>
                    <div className="flex h-9 items-center">
                      <Switch
                        id="internal-chat-manage-participant-role"
                        checked={availableParticipantRole === 'admin'}
                        onCheckedChange={(checked) => setAvailableParticipantRole(checked ? 'admin' : 'normal')}
                      />
                    </div>
                  </div>
                  <AdminButton type="submit" variant="outline" size="icon-sm">
                    <Check className="h-4 w-4" />
                    <span className="sr-only">Incluir participante</span>
                  </AdminButton>
                </div>

                <div className="space-y-2">
                  {members.length > 0 ? (
                    members.map((participant) => (
                      <div key={participant.participantId} className="flex items-center justify-between gap-3 border-b border-border pb-2">
                        <AdminInput value={participant.participantName} disabled />
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span>Admin</span>
                            <Switch
                              checked={participant.role === 'admin'}
                              onCheckedChange={(checked) => {
                                if (!selectedAccount) {
                                  return;
                                }

                                void (async () => {
                                  const nextMembers = await updateHomeInternalChatGroupMemberRole({
                                    accountId: selectedAccount.accountId,
                                    conversationId: selectedConversation.id,
                                    participantAccountId: participant.participantId,
                                    role: checked ? 'admin' : 'normal',
                                  });

                                  setMembers(nextMembers);
                                })();
                              }}
                            />
                          </div>
                          <AdminButton
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            onClick={() => {
                              if (!selectedAccount) {
                                return;
                              }

                              void (async () => {
                                const nextMembers = await removeHomeInternalChatGroupMember({
                                  accountId: selectedAccount.accountId,
                                  conversationId: selectedConversation.id,
                                  participantAccountId: participant.participantId,
                                });

                                setMembers(nextMembers);
                                await reloadConversations();
                              })();
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Remover participante</span>
                          </AdminButton>
                        </div>
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
          </AdminDialogContent>
        </Dialog>
      ) : null}
    </>
  );
}

function ConversationAttachment({
  accountId,
  conversationId,
  messageId,
  attachment,
}: {
  accountId: string;
  conversationId: string;
  messageId: string;
  attachment: {
    name: string;
    contentType?: string;
    sizeBytes?: number;
  };
}) {
  const [imageUrl, setImageUrl] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (!accountId || !isImageAttachment(attachment.contentType)) {
      return;
    }

    let revoked = false;
    let currentUrl = '';

    void (async () => {
      const blob = await getHomeInternalChatAttachmentBlob({
        accountId,
        conversationId,
        messageId,
        attachmentName: attachment.name,
      });

      currentUrl = URL.createObjectURL(blob);

      if (!revoked) {
        setImageUrl(currentUrl);
      }
    })();

    return () => {
      revoked = true;

      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }
    };
  }, [accountId, attachment.contentType, attachment.name, conversationId, messageId]);

  if (isImageAttachment(attachment.contentType) && imageUrl) {
    return (
      <>
        <button type="button" className="overflow-hidden rounded-sm border border-border" onClick={() => setPreviewOpen(true)}>
          <img src={imageUrl} alt={attachment.name} className="h-20 w-20 object-cover" />
        </button>

        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <AdminDialogContent>
            <AdminDialogHeader>
              <AdminDialogTitle>{attachment.name}</AdminDialogTitle>
            </AdminDialogHeader>
            <AdminDialogBody>
              <img src={imageUrl} alt={attachment.name} className="max-h-[70dvh] w-full rounded-sm object-contain" />
            </AdminDialogBody>
          </AdminDialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <button
      type="button"
      className="rounded-sm border border-border px-3 py-2 text-xs text-muted-foreground"
      onClick={() => {
        if (!accountId) {
          return;
        }

        void (async () => {
          const blob = await getHomeInternalChatAttachmentBlob({
            accountId,
            conversationId,
            messageId,
            attachmentName: attachment.name,
          });
          const url = URL.createObjectURL(blob);
          window.open(url, '_blank', 'noopener,noreferrer');
          window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        })();
      }}
    >
      {attachment.name}
    </button>
  );
}
