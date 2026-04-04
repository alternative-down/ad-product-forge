import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useMemo, useState } from 'react';

import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
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
    <div className="min-w-0 space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {conversations.length > 0 ? (
        <div className="space-y-5 md:grid md:grid-cols-[260px_minmax(0,1fr)] md:gap-6 md:space-y-0">
          <div className={selectedConversation ? 'hidden md:block' : ''}>
            <div className="space-y-2">
              {conversations.map((conversation) => {
                const selected = conversation.conversationId === selectedConversation?.conversationId;

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
                      <div className="text-sm font-medium text-foreground">
                        {conversation.name ?? conversation.provider}
                      </div>
                      <div className="line-clamp-2 text-sm text-muted-foreground">
                        {conversation.participants.join(', ')}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className={selectedConversation ? 'block' : 'hidden md:block'}>
            {selectedConversation ? (
              <div className="space-y-4">
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
                  <div className="text-sm text-muted-foreground">
                    {selectedConversation.participants.join(', ')}
                  </div>
                </div>

                <div className="space-y-3">
                  {selectedConversation.messages.map((message) => (
                    <article key={message.messageId} className="space-y-1 rounded-sm border border-border bg-background px-4 py-3">
                      <div className="text-xs text-muted-foreground">
                        {message.authorDisplayName} · {formatDateTime(message.createdAt)}
                      </div>
                      <div className="text-sm leading-6 text-foreground">{message.content}</div>
                    </article>
                  ))}
                </div>
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
