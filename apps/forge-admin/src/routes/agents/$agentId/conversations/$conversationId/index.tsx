import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useMemo } from 'react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getAgent } from '@/lib/admin-api';

export const Route = createFileRoute('/agents/$agentId/conversations/$conversationId/')({
  component: AgentConversationDetailIndexRoute,
});

function AgentConversationDetailIndexRoute() {
  const navigate = useNavigate();
  const { agentId, conversationId } = Route.useParams();
  const decodedConversationId = decodeURIComponent(conversationId);
  const agentQuery = useQuery({
    queryKey: ['admin', 'agent', agentId],
    queryFn: () => getAgent(agentId),
  });
  const conversations = useMemo(() => agentQuery.data?.recentConversations ?? [], [agentQuery.data?.recentConversations]);
  const selectedConversation =
    conversations.find((conversation) => conversation.conversationId === decodedConversationId) ?? null;

  if (!selectedConversation) {
    return <div className="text-sm text-muted-foreground">Conversa não encontrada.</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void navigate({ to: '/agents/$agentId/conversations', params: { agentId } })}
            className="text-muted-foreground md:hidden"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="sr-only">Voltar</span>
          </button>
          <div className="text-base font-semibold tracking-[-0.03em]">
            {selectedConversation.name ?? selectedConversation.provider}
          </div>
        </div>
        {selectedConversation.participants.length > 2 ? (
          <div className="text-sm text-muted-foreground">
            {selectedConversation.participants.join(', ')}
          </div>
        ) : null}
      </div>

      <ScrollArea className="-mr-2 h-full min-h-0 [&_[data-slot=scroll-area-scrollbar]]:border-l-0">
        <div className="space-y-3 pr-3">
          {selectedConversation.messages.map((message) => (
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
              </div>
            </article>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
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
