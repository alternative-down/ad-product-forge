import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';

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
  const conversations = agentQuery.data?.recentConversations ?? [];

  return (
    <div className="min-w-0 space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {conversations.map((conversation) => (
        <article key={conversation.conversationId} className="space-y-3 rounded-sm border border-border bg-background px-4 py-3">
          <div className="space-y-1">
            <div className="text-base font-semibold tracking-[-0.03em]">
              {conversation.name ?? conversation.provider}
            </div>
            <div className="text-sm text-muted-foreground">
              {conversation.participants.join(', ')}
            </div>
          </div>

          <div className="space-y-2">
            {conversation.messages.map((message) => (
              <div key={message.messageId} className="space-y-1">
                <div className="text-xs text-muted-foreground">
                  {message.authorDisplayName} · {formatDateTime(message.createdAt)}
                </div>
                <div className="text-sm leading-6 text-foreground">{message.content}</div>
              </div>
            ))}
          </div>
        </article>
      ))}

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
