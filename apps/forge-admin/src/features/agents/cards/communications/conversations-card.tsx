import { Bot, LoaderCircle } from 'lucide-react';
import type { AgentDetail } from '../../../../lib/api';
import { formatDateTimeText } from '../../utils';
import { cn } from '../../../../lib/utils';
import { Card } from '../../../../components/ui/card';
import { Badge } from '../../../../components/ui/badge';

export function AgentConversationsCard(input: {
  conversations: AgentDetail['conversations'];
  selectedConversationKey: string | null;
  onSelectConversation(key: string): void;
  isLoading: boolean;
}) {
  const selectedConversation = input.conversations.find(
    (c) => c.providerConversationKey === input.selectedConversationKey,
  );

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2">
        <Bot className="h-5 w-5 text-slate-400" />
        <h2 className="text-lg font-semibold text-slate-950">Conversations</h2>
      </div>

      {input.isLoading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-slate-600">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Loading conversations...
        </div>
      ) : input.conversations.length === 0 ? (
        <div className="mt-4 text-sm text-slate-500">No conversations found.</div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            {input.conversations.map((conversation) => {
              const isSelected = conversation.providerConversationKey === input.selectedConversationKey;
              return (
                <button
                  key={conversation.providerConversationKey}
                  onClick={() => input.onSelectConversation(conversation.providerConversationKey)}
                  className={cn(
                    'w-full rounded-lg border p-3 text-left text-sm transition',
                    isSelected
                      ? 'border-[color:var(--accent)] bg-[color:var(--accent-soft)]'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium text-slate-950">
                      {conversation.name || 'Unnamed conversation'}
                    </span>
                    {conversation.unreadCount > 0 && (
                      <Badge className="shrink-0 bg-blue-100 text-blue-800">
                        {conversation.unreadCount} new
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-slate-500">
                    <span>{conversation.provider}</span>
                    <span>·</span>
                    <span>{conversation.type}</span>
                    <span>·</span>
                    <span>{formatDateTimeText(conversation.updatedAt)}</span>
                  </div>
                  {conversation.participants && conversation.participants.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {conversation.participants.map((p) => (
                        <Badge key={p} className="text-xs">
                          {p}
                        </Badge>
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            {selectedConversation ? (
              <div className="space-y-4">
                <div>
                  <div className="text-sm font-medium text-slate-950">
                    {selectedConversation.name || 'Unnamed conversation'}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {selectedConversation.provider} · {selectedConversation.type} ·{' '}
                    {formatDateTimeText(selectedConversation.updatedAt)}
                  </div>
                </div>

                <div className="max-h-80 space-y-3 overflow-y-auto">
                  {selectedConversation.messages.map((message, i) => (
                    <div key={i} className="rounded-lg border border-slate-200 bg-white p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{message.authorRole}</Badge>
                          <Badge variant="secondary">{message.type}</Badge>
                        </div>
                        <span className="text-xs text-slate-500">
                          {formatDateTimeText(message.createdAt)}
                        </span>
                      </div>
                      <div className="mt-2 text-sm text-slate-700">{message.content}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex h-40 items-center justify-center text-sm text-slate-500">
                Select a conversation to view messages
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
