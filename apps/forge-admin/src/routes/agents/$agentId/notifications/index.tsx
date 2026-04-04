import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { getAgent } from '@/lib/admin-api';

export const Route = createFileRoute('/agents/$agentId/notifications/')({
  component: AgentNotificationsIndexRoute,
});

function AgentNotificationsIndexRoute() {
  const { agentId } = Route.useParams();
  const agentQuery = useQuery({
    queryKey: ['admin', 'agent', agentId],
    queryFn: () => getAgent(agentId),
  });
  const notifications = agentQuery.data?.recentNotifications ?? [];

  return (
    <div className="min-w-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {notifications.length === 0 ? <div className="text-sm text-muted-foreground">Nenhuma notificação ainda.</div> : null}

      {notifications.map((notification, index) => (
        <article key={notification.notificationId} className={index > 0 ? 'border-t border-border pt-5' : ''}>
          <div className="space-y-3 pb-5">
            <header className="flex flex-wrap items-center gap-3">
              <Badge variant="outline">
                <Bell className="h-3.5 w-3.5" />
                Notificação
              </Badge>
              <Badge variant="outline">{notification.read ? 'Lida' : 'Nova'}</Badge>
              <div className="text-xs text-muted-foreground">{formatDateTime(notification.timestamp)}</div>
            </header>

            <div className="whitespace-pre-wrap text-sm leading-6 text-foreground">
              {notification.content}
            </div>
          </div>
        </article>
      ))}

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
