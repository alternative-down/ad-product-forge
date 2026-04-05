import { Link } from '@tanstack/react-router';
import { ChevronRight, Pencil, Plus } from 'lucide-react';

import { AdminButton, AdminScrollArea } from '@/components/admin';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatRecentMessageTime, getInitials, type LocalConversation } from './-context';

export function ConversationListPane(input: {
  accounts: Array<{ accountId: string; displayName: string; slug: string; description: string }>;
  selectedAccountId: string;
  selectedAccountLabel: string;
  selectedConversationId: string;
  mobileDetailOpen: boolean;
  conversations: LocalConversation[];
  onSelectAccount(value: string): void;
  onEditAccount(): void;
  onCreateAccount(): void;
  onCreateConversation(): void;
}) {
  return (
    <div className={input.mobileDetailOpen ? 'hidden h-full min-h-0 flex-col gap-3 md:flex' : 'flex h-full min-h-0 flex-col gap-3'}>
      <section className="space-y-2">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="home-conversations-account">
            Conta
          </label>
          <div className="flex items-center gap-2">
            <Select
              value={input.selectedAccountId || '__none__'}
              onValueChange={(value) => input.onSelectAccount(value === '__none__' ? '' : value)}
            >
              <SelectTrigger id="home-conversations-account" className="w-full">
                <SelectValue>{input.selectedAccountLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Selecione uma conta</SelectItem>
                {input.accounts.map((account) => (
                  <SelectItem key={account.accountId} value={account.accountId}>
                    {account.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <AdminButton variant="outline" size="icon-sm" disabled={!input.selectedAccountId} onClick={input.onEditAccount}>
              <Pencil className="h-4 w-4" />
              <span className="sr-only">Editar conta</span>
            </AdminButton>
            <AdminButton variant="outline" size="icon-sm" onClick={input.onCreateAccount}>
              <Plus className="h-4 w-4" />
              <span className="sr-only">Nova conta</span>
            </AdminButton>
          </div>
        </div>
      </section>

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <AdminButton
          variant="outline"
          className="w-full justify-center"
          disabled={!input.selectedAccountId}
          onClick={input.onCreateConversation}
        >
          <Plus className="h-4 w-4" />
          Nova conversa
        </AdminButton>

        <AdminScrollArea className="h-full" contentClassName="space-y-2">
          {input.selectedAccountId ? (
            input.conversations.length > 0 ? (
              input.conversations.map((conversation) => {
                const latestMessage = conversation.messages.at(-1) ?? null;
                const selected = conversation.id === input.selectedConversationId;

                return (
                  <Link
                    key={conversation.id}
                    to="/home/conversations/$conversationId"
                    params={{ conversationId: conversation.id }}
                    className={
                      selected
                        ? 'block min-w-0 rounded-sm border border-border bg-muted px-4 py-3 text-left'
                        : 'block min-w-0 rounded-sm border border-border bg-background px-4 py-3 text-left'
                    }
                  >
                    <div className="flex items-start gap-3">
                      <Avatar className="h-9 w-9 border border-border bg-muted">
                        <AvatarFallback className="bg-muted text-xs font-medium text-foreground">
                          {getInitials(conversation.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 text-sm font-medium text-foreground">
                            {conversation.name}
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
              })
            ) : (
              <div className="rounded-sm border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
                Nenhuma conversa ainda.
              </div>
            )
          ) : (
            <div className="rounded-sm border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
              Selecione uma conta para abrir as conversas.
            </div>
          )}
        </AdminScrollArea>
      </div>
    </div>
  );
}
