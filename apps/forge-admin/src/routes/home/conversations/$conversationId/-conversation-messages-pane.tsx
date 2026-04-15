import { ArrowDown } from 'lucide-react';
import { Link } from '@tanstack/react-router';

import { AgentAvatar, AdminButton, AdminScrollArea } from '@/components/admin';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import type { HomeInternalChatConversationMessage } from '@/lib/admin-api';
import { getInitials } from '../-context';
import { ConversationAttachment } from './-conversation-attachment';

export function ConversationMessagesPane(input: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  accountId: string;
  conversationId: string;
  messages: HomeInternalChatConversationMessage[];
  contactByAccountId: Map<string, { agentId?: string | null }>;
  formatRecentMessageTime(value: number): string;
  autoScrollEnabled: boolean;
  onScrollToBottom(): void;
}) {
  const {
    containerRef,
    accountId,
    conversationId,
    messages,
    contactByAccountId,
    formatRecentMessageTime,
    autoScrollEnabled,
    onScrollToBottom,
  } = input;

  return (
    <div ref={containerRef} className="relative min-h-0 flex-1 overflow-hidden">
      <AdminScrollArea className="h-full" contentClassName="space-y-3">
        {messages.map((message) => {
          const authorContact = contactByAccountId.get(message.authorAccountId);

          return (
            <article key={message.messageId} className="flex items-start gap-3 py-1">
              {authorContact?.agentId ? (
                <Link to="/agents/$agentId" params={{ agentId: authorContact.agentId }} className="shrink-0">
                  <AgentAvatar
                    agentId={authorContact.agentId}
                    name={message.authorDisplayName}
                    className="h-9 w-9 border border-border bg-muted"
                    fallbackClassName="bg-muted text-xs font-medium text-foreground"
                  />
                </Link>
              ) : (
                <Avatar className="h-9 w-9 border border-border bg-muted">
                  <AvatarFallback className="bg-muted text-xs font-medium text-foreground">
                    {getInitials(message.authorDisplayName)}
                  </AvatarFallback>
                </Avatar>
              )}
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-foreground">{message.authorDisplayName}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatRecentMessageTime(message.createdAt)}
                  </span>
                </div>
                <div className="whitespace-pre-wrap text-sm leading-6 text-foreground">{message.content}</div>
                {message.attachments.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {message.attachments.map((attachment) => (
                      <ConversationAttachment
                        key={`${message.messageId}:${attachment.name}`}
                        accountId={accountId}
                        conversationId={conversationId}
                        messageId={message.messageId}
                        attachment={attachment}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            </article>
          );
        })}
      </AdminScrollArea>
      {!autoScrollEnabled ? (
        <AdminButton
          variant="outline"
          size="icon-sm"
          className="absolute bottom-3 right-1"
          onClick={onScrollToBottom}
        >
          <ArrowDown className="h-4 w-4" />
          <span className="sr-only">Ir para o final</span>
        </AdminButton>
      ) : null}
    </div>
  );
}
