import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Settings2 } from 'lucide-react';
import { useState } from 'react';

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
import {
  createLocalId,
  formatRecentMessageTime,
  getInitials,
  useHomeConversations,
} from '../-context';

export const Route = createFileRoute('/home/conversations/$conversationId/')({
  component: HomeConversationDetailIndexRoute,
});

function HomeConversationDetailIndexRoute() {
  const navigate = useNavigate();
  const { conversationId } = Route.useParams();
  const { conversations, selectedAccount, setConversations } = useHomeConversations();
  const [participantsDialogOpen, setParticipantsDialogOpen] = useState(false);
  const [participantDraft, setParticipantDraft] = useState('');
  const [messageDraft, setMessageDraft] = useState('');
  const [attachmentDrafts, setAttachmentDrafts] = useState<File[]>([]);
  const selectedConversation = conversations.find((conversation) => conversation.id === decodeURIComponent(conversationId)) ?? null;
  const selectedConversationMessages = selectedConversation?.messages ?? [];

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
              disabled={!selectedAccount || !messageDraft.trim()}
              onClick={() => {
                if (!selectedAccount || !messageDraft.trim()) {
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
        </AdminDialogContent>
      </Dialog>
    </>
  );
}
