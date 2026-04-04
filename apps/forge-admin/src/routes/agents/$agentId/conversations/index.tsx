import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';

import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getAgent } from '@/lib/admin-api';

export const Route = createFileRoute('/agents/$agentId/conversations/')({
  component: AgentConversationsIndexRoute,
});

function AgentConversationsIndexRoute() {
  const { agentId } = Route.useParams();
  const agentQuery = useQuery({
    queryKey: ['admin', 'agent', agentId],
    queryFn: () => getAgent(agentId),
  });
  const isMobile = useIsMobile();
  const conversations = useMemo(() => agentQuery.data?.recentConversations ?? [], [agentQuery.data?.recentConversations]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const selectedConversation = useMemo(
    () =>
      conversations.find((conversation) => conversation.conversationId === selectedConversationId) ??
      (!isMobile ? conversations[0] ?? null : null),
    [conversations, isMobile, selectedConversationId],
  );

  return (
    <div className="min-w-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {conversations.length > 0 ? (
        <div className="flex h-[calc(100dvh-12rem)] min-h-0 flex-col md:grid md:grid-cols-[260px_minmax(0,1fr)] md:gap-6">
          <div className={selectedConversation ? 'hidden min-h-0 md:block' : 'min-h-0'}>
            <ScrollArea className="-mr-2 h-full [&_[data-slot=scroll-area-scrollbar]]:border-l-0">
              <div className="space-y-2 pr-3">
                {conversations.map((conversation) => {
                  const selected = conversation.conversationId === selectedConversation?.conversationId;
                  const latestMessage = conversation.messages[0] ?? null;

                  return (
                    <button
                      key={conversation.conversationId}
                      type="button"
                      onClick={() => setSelectedConversationId(conversation.conversationId)}
                      className={
                        selected
                          ? 'block w-full rounded-sm border border-border bg-muted px-4 py-3 text-left'
                          : 'block w-full rounded-sm border border-border bg-background px-4 py-3 text-left'
                      }
                    >
                      <div className="space-y-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 text-sm font-medium text-foreground">
                            {conversation.name ?? conversation.provider}
                          </div>
                          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground md:hidden" />
                        </div>
                        {conversation.type === 'group' ? (
                          <div className="line-clamp-2 text-sm text-muted-foreground">
                            {conversation.participants.join(', ')}
                          </div>
                        ) : null}
                        {latestMessage ? (
                          <>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="truncate">{latestMessage.authorDisplayName}</span>
                              <span className="shrink-0">{formatRecentMessageTime(latestMessage.createdAt)}</span>
                            </div>
                            <div className="truncate text-sm text-foreground">
                              {latestMessage.content}
                            </div>
                          </>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          <div className={selectedConversation ? 'min-h-0 block' : 'hidden min-h-0 md:block'}>
            {selectedConversation ? (
              <div className="flex h-full min-h-0 flex-col gap-4">
                <div className="flex items-center justify-between gap-3 md:hidden">
                  <Button variant="ghost" size="sm" onClick={() => setSelectedConversationId(null)}>
                    <ArrowLeft className="h-4 w-4" />
                    Voltar
                  </Button>
                </div>

                <div className="space-y-1">
                  <div className="text-base font-semibold tracking-[-0.03em]">
                    {selectedConversation.name ?? selectedConversation.provider}
                  </div>
                  {selectedConversation.type === 'group' ? (
                    <div className="text-sm text-muted-foreground">
                      {selectedConversation.participants.join(', ')}
                    </div>
                  ) : null}
                </div>

                <ScrollArea className="-mr-2 h-full min-h-0 [&_[data-slot=scroll-area-scrollbar]]:border-l-0">
                  <div className="space-y-3 pr-3">
                    {selectedConversation.messages.map((message) => (
                      <article key={message.messageId} className="space-y-1 rounded-sm border border-border bg-background px-4 py-3">
                        <div className="text-xs text-muted-foreground">
                          {message.authorDisplayName} · {formatDateTime(message.createdAt)}
                        </div>
                        <div className="text-sm leading-6 text-foreground">{message.content}</div>
                      </article>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {conversations.length === 0 ? <div className="text-sm text-muted-foreground">Nenhuma conversa recente.</div> : null}
      {agentQuery.error ? <div className="text-sm text-destructive">{agentQuery.error.message}</div> : null}
    </div>
  );
}

function formatDateTime(value: number) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(value);
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
