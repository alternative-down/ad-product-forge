import { Archive, ArrowLeft, Pencil, Settings2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { LocalConversation } from './context';

export function ConversationHeader({
  conversation,
  canManageGroup,
  onBack,
  onRenameOpen,
  onArchive,
  onParticipantsOpen,
}: {
  conversation: LocalConversation;
  canManageGroup: boolean;
  onBack(): void;
  onRenameOpen(): void;
  onArchive(): void;
  onParticipantsOpen(): void;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onBack} className="text-muted-foreground md:hidden">
          <ArrowLeft className="h-4 w-4" />
          <span className="sr-only">Voltar</span>
        </button>
        <div className="text-base font-semibold tracking-[-0.03em]">{conversation.name}</div>
        {canManageGroup ? (
          <Button variant="outline" size="icon-sm" onClick={onRenameOpen}>
            <Pencil className="h-4 w-4" />
            <span className="sr-only">Editar nome da conversa</span>
          </Button>
        ) : null}
        {canManageGroup ? (
          <Button variant="outline" size="icon-sm" onClick={onParticipantsOpen}>
            <Settings2 className="h-4 w-4" />
            <span className="sr-only">Participantes</span>
          </Button>
        ) : null}
        <Button variant="outline" size="icon-sm" onClick={onArchive}>
          <Archive className="h-4 w-4" />
          <span className="sr-only">Arquivar conversa</span>
        </Button>
      </div>
    </div>
  );
}
