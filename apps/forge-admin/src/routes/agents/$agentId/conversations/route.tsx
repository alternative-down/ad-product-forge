import { Link, Outlet, createFileRoute, useRouterState } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { useMemo } from 'react';

import { AdminScrollArea } from '@/components/admin';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { getAgent } from '@/lib/admin-api';

export const Route = createFileRoute('/agents/$agentId/conversations')({
  component: AgentConversationsLayoutRoute,
});

function AgentConversationsLayoutRoute() {
  const { agentId } = Route.useParams();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const agentQuery = useQuery({
    queryKey: ['admin', 'agent', agentId],
    queryFn: () => getAgent(agentId),
  });
  const conversations = useMemo(() => agentQuery.data?.recentConversations ?? [], [agentQuery.data?.recentConversations]);
  const selectedConversationId = pathname.startsWith(`/agents/${agentId}/conversations/`)
    ? decodeURIComponent(pathname.split('/conversations/')[1] ?? '')
    : null;
  const selectedConversation = conversations.find((conversation) => conversation.conversationId === selectedConversationId) ?? null;

  return (
    <div className="min-w-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {conversations.length > 0 ? (
        <div className="flex h-[calc(100dvh-12rem)] min-h-0 flex-col md:grid md:grid-cols-[260px_minmax(0,1fr)] md:gap-6">
          <div className={selectedConversation ? 'hidden min-h-0 md:block' : 'min-h-0'}>
            <AdminScrollArea className="h-full" contentClassName="space-y-1">
                {conversations.map((conversation) => {
                  const selected = conversation.conversationId === selectedConversation?.conversationId;
                  const latestMessage = conversation.messages.at(-1) ?? null;
                  const conversationPath = buildConversationPath(agentId, conversation.conversationId);

                  return (
                    <Link
                      key={conversation.conversationId}
                      to={conversationPath}
                      className={
                        selected
                          ? 'block w-full rounded-sm border border-border bg-muted px-4 py-3 text-left'
                          : 'block w-full rounded-sm border border-border bg-background px-4 py-3 text-left'
                      }
                    >
                        <div className="flex items-start gap-3">
                          <Avatar className="h-9 w-9 border border-border bg-muted">
                            <AvatarFallback className="bg-muted text-xs font-medium text-foreground">
                              {getInitials(conversation.name ?? conversation.provider)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 text-sm font-medium text-foreground">
                                {conversation.name ?? conversation.provider}
                              </div>
                              {latestMessage ? (
                                <span className="hidden shrink-0 text-xs text-muted-foreground md:inline">
                                  {formatRecentMessageTime(latestMessage.createdAt)}
                                </span>
                              ) : null}
                              <div className="flex shrink-0 items-center gap-2 md:hidden">
                                {latestMessage ? (
                                  <span className="text-xs text-muted-foreground">
                                    {formatRecentMessageTime(latestMessage.createdAt)}
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
                            {latestMessage ? (
                              <div className="space-y-1 pt-2">
                                <div className="truncate text-sm text-foreground">
                                  <span className="text-muted-foreground">{latestMessage.authorDisplayName}: </span>
                                  <span>{latestMessage.content}</span>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </Link>
                  );
                })}
            </AdminScrollArea>
          </div>

          <div className={selectedConversation ? 'min-h-0 block' : 'hidden min-h-0 md:block'}>
            <Outlet />
          </div>
        </div>
      ) : null}

      {conversations.length === 0 ? <div className="text-sm text-muted-foreground">Nenhuma conversa recente.</div> : null}
      {agentQuery.error ? <div className="text-sm text-destructive">{agentQuery.error.message}</div> : null}
    </div>
  );
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

function buildConversationPath(agentId: string, conversationId: string) {
  return `/agents/${agentId}/conversations/${encodeURIComponent(conversationId)}`;
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
