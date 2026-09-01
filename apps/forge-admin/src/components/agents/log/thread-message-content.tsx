
import { Badge } from '@/components/ui/badge';
import { type AgentThreadMessage } from '@/lib/admin-api/index';

export function ThreadMessageArticle(input: { message: AgentThreadMessage; index: number }) {
  return (
    <article
      className={`min-w-0 overflow-hidden ${input.index > 0 ? 'border-t border-border pt-5' : ''}`}
    >
      <div className="min-w-0 space-y-3 pb-5">
        <header className="flex flex-wrap items-center gap-3">
          <Badge variant="outline">{humanizeRole(input.message.role)}</Badge>
          {input.message.type ? <Badge variant="outline">{input.message.type}</Badge> : null}
          <div className="text-xs text-muted-foreground">
            {formatDateTime(input.message.createdAt)}
          </div>
        </header>

        <ThreadMessageContent message={input.message} />
      </div>
    </article>
  );
}

function humanizeRole(role: string) {
  if (role === 'assistant') {
    return 'Assistente';
  }

  if (role === 'user') {
    return 'Usuário';
  }

  if (role === 'system') {
    return 'Sistema';
  }

  return role;
}

function formatDateTime(value: number) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(value);
}
