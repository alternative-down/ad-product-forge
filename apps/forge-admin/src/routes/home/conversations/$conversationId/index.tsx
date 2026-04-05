import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { Archive, ArrowDown, ArrowLeft, Pencil, SendHorizontal, Settings2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  AdminButton,
  AdminScrollArea,
  AdminTextarea,
} from '@/components/admin';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  addHomeInternalChatGroupMember,
  archiveHomeInternalChatConversation,
  getHomeInternalChatGroupMembers,
  getHomeInternalChatMessages,
  removeHomeInternalChatGroupMember,
  sendHomeInternalChatMessage,
  updateHomeInternalChatConversation,
  updateHomeInternalChatGroupMemberRole,
  type HomeInternalChatConversationMessage,
} from '@/lib/admin-api';
import { formatRecentMessageTime, getInitials, useHomeConversations } from '../-context';
import { ConversationAttachment } from './-conversation-attachment';
import { ParticipantsDialog } from './-participants-dialog';
import { RenameConversationDialog } from './-rename-conversation-dialog';

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

      <RenameConversationDialog
        open={renameDialogOpen}
        groupNameDraft={groupNameDraft}
        onOpenChange={setRenameDialogOpen}
        onGroupNameDraftChange={setGroupNameDraft}
        onSubmit={() => {
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
      />

      {selectedConversation.type === 'group' ? (
        <ParticipantsDialog
          open={participantsDialogOpen}
          members={members}
          availableParticipantId={availableParticipantId}
          availableParticipantRole={availableParticipantRole}
          availableParticipants={availableParticipants}
          onOpenChange={setParticipantsDialogOpen}
          onAvailableParticipantIdChange={setAvailableParticipantId}
          onAvailableParticipantRoleChange={setAvailableParticipantRole}
          onAddParticipant={() => {
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
          onRoleToggle={(participantId, nextIsAdmin) => {
            if (!selectedAccount) {
              return;
            }

            void (async () => {
              const nextMembers = await updateHomeInternalChatGroupMemberRole({
                accountId: selectedAccount.accountId,
                conversationId: selectedConversation.id,
                participantAccountId: participantId,
                role: nextIsAdmin ? 'admin' : 'normal',
              });

              setMembers(nextMembers);
            })();
          }}
          onRemoveParticipant={(participantId) => {
            if (!selectedAccount) {
              return;
            }

            void (async () => {
              const nextMembers = await removeHomeInternalChatGroupMember({
                accountId: selectedAccount.accountId,
                conversationId: selectedConversation.id,
                participantAccountId: participantId,
              });

              setMembers(nextMembers);
              await reloadConversations();
            })();
          }}
        />
      ) : null}
    </>
  );
}
