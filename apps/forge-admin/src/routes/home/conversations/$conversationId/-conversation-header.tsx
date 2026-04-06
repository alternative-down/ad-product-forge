import { Archive, ArrowLeft, Pencil, Settings2 } from 'lucide-react';

import { AdminButton } from '@/components/admin';

import type { HomeInternalChatGroupMember, LocalConversation } from '../-context';

export function ConversationHeader({
  conversation,
  members,
  onBack,
  onRenameOpen,
  onArchive,
  onParticipantsOpen,
}: {
  conversation: LocalConversation;
  members: HomeInternalChatGroupMember[];
  onBack(): void;
  onRenameOpen(): void;
  onArchive(): void;
  onParticipantsOpen(): void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onBack} className="text-muted-foreground md:hidden">
          <ArrowLeft className="h-4 w-4" />
          <span className="sr-only">Voltar</span>
        </button>
        <div className="text-base font-semibold tracking-[-0.03em]">{conversation.name}</div>
        {conversation.type === 'group' ? (
          <AdminButton variant="outline" size="icon-sm" onClick={onRenameOpen}>
            <Pencil className="h-4 w-4" />
            <span className="sr-only">Editar nome da conversa</span>
          </AdminButton>
        ) : null}
        <AdminButton variant="outline" size="icon-sm" onClick={onArchive}>
          <Archive className="h-4 w-4" />
          <span className="sr-only">Arquivar conversa</span>
        </AdminButton>
      </div>
      {conversation.type === 'group' ? (
        <div className="flex items-start justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            {members.length > 0
              ? members.map((member) => member.participantName).join(', ')
              : 'Sem participantes.'}
          </div>
          <AdminButton variant="outline" size="icon-sm" onClick={onParticipantsOpen}>
            <Settings2 className="h-4 w-4" />
            <span className="sr-only">Participantes</span>
          </AdminButton>
        </div>
      ) : null}
    </div>
  );
}
