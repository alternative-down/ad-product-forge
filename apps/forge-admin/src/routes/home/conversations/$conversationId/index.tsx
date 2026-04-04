import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Settings2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

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
  addHomeInternalChatGroupMember,
  getHomeInternalChatGroupMembers,
  getHomeInternalChatMessages,
  removeHomeInternalChatGroupMember,
  sendHomeInternalChatMessage,
  updateHomeInternalChatGroupMemberRole,
  type HomeInternalChatConversationMessage,
  type HomeInternalChatGroupMember,
} from '@/lib/admin-api';
import {
  formatRecentMessageTime,
  getInitials,
  useHomeConversations,
} from '../-context';

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
  const [participantsDialogOpen, setParticipantsDialogOpen] = useState(false);
  const [availableParticipantId, setAvailableParticipantId] = useState('');
  const [availableParticipantRole, setAvailableParticipantRole] = useState<'admin' | 'normal'>('normal');
  const [messageDraft, setMessageDraft] = useState('');
  const [attachmentDrafts, setAttachmentDrafts] = useState<File[]>([]);
  const [messages, setMessages] = useState<HomeInternalChatConversationMessage[]>([]);
  const [members, setMembers] = useState<HomeInternalChatGroupMember[]>([]);
  const selectedConversation = conversations.find((conversation) => conversation.id === decodeURIComponent(conversationId)) ?? null;
  const availableParticipants = useMemo(() => {
    const memberIds = new Set(members.map((member) => member.participantId));

    return contacts.filter((contact) => contact.isAgent && !memberIds.has(contact.accountId));
  }, [contacts, members]);

  useEffect(() => {
    if (!selectedAccount || !selectedConversation) {
      return;
    }

    let cancelled = false;

    async function loadConversationState() {
      const [messageResult, memberResult] = await Promise.all([
        getHomeInternalChatMessages(selectedAccount.accountId, selectedConversation.id, 100, 0),
        selectedConversation.type === 'group'
          ? getHomeInternalChatGroupMembers(selectedAccount.accountId, selectedConversation.id)
          : Promise.resolve([]),
      ]);

      if (!cancelled) {
        setMessages(messageResult.items);
        setMembers(memberResult);
      }
    }

    void loadConversationState();

    return () => {
      cancelled = true;
    };
  }, [selectedAccount, selectedConversation]);

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

        <div className="min-h-0 flex-1">
          <AdminScrollArea className="h-full" contentClassName="space-y-3">
            {messages.map((message) => (
              <article key={message.messageId} className="flex items-start gap-3 py-1">
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
                  await reloadConversations();
                })();
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
      </div>

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
                  <Select value={availableParticipantId || '__none__'} onValueChange={(value) => setAvailableParticipantId(value === '__none__' ? '' : value)}>
                    <SelectTrigger id="internal-chat-manage-participant" className="w-full">
                      <SelectValue>{availableParticipants.find((participant) => participant.accountId === availableParticipantId)?.displayName ?? 'Selecione um participante'}</SelectValue>
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
                <div className="w-32 space-y-2">
                  <label className="text-sm font-medium" htmlFor="internal-chat-manage-participant-role">
                    Papel
                  </label>
                  <Select value={availableParticipantRole} onValueChange={(value: 'admin' | 'normal') => setAvailableParticipantRole(value)}>
                    <SelectTrigger id="internal-chat-manage-participant-role" className="w-full">
                      <SelectValue>{availableParticipantRole === 'admin' ? 'Admin' : 'Normal'}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <AdminButton type="submit">Incluir</AdminButton>
              </div>

              <div className="space-y-2">
                {members.length > 0 ? (
                  members.map((participant) => (
                    <div key={participant.participantId} className="flex items-center justify-between gap-3 border-b border-border pb-2">
                      <AdminInput value={participant.participantName} disabled />
                      <Select
                        value={participant.role === 'admin' ? 'admin' : 'normal'}
                        onValueChange={(value: 'admin' | 'normal') => {
                          if (!selectedAccount) {
                            return;
                          }

                          void (async () => {
                            const nextMembers = await updateHomeInternalChatGroupMemberRole({
                              accountId: selectedAccount.accountId,
                              conversationId: selectedConversation.id,
                              participantAccountId: participant.participantId,
                              role: value,
                            });

                            setMembers(nextMembers);
                          })();
                        }}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue>{participant.role === 'admin' ? 'Admin' : 'Normal'}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                      <AdminButton
                        type="button"
                        variant="outline"
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
        </AdminDialogContent>
      </Dialog>
    </>
  );
}
