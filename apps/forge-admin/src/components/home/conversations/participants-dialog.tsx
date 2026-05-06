import { Check, Trash2 } from 'lucide-react';

import {
  AdminButton,
  AdminDialogBody,
  AdminDialogContent,
  AdminDialogFooter,
  AdminDialogHeader,
  AdminDialogTitle,
  AdminInput,
} from '@/components/admin';
import { Dialog } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { HomeInternalChatGroupMember } from '@/lib/admin-api/index';

export function participants-dialog(input: {
  open: boolean;
  members: HomeInternalChatGroupMember[];
  availableParticipantId: string;
  availableParticipantRole: 'admin' | 'normal';
  availableParticipants: Array<{ accountId: string; displayName: string }>;
  onOpenChange(open: boolean): void;
  onAvailableParticipantIdChange(value: string): void;
  onAvailableParticipantRoleChange(value: 'admin' | 'normal'): void;
  onAddParticipant(): void;
  onRoleToggle(participantId: string, nextIsAdmin: boolean): void;
  onRemoveParticipant(participantId: string): void;
}) {
  return (
    <Dialog open={input.open} onOpenChange={input.onOpenChange}>
      <AdminDialogContent>
        <AdminDialogHeader>
          <AdminDialogTitle>Participantes</AdminDialogTitle>
        </AdminDialogHeader>

        <form
          className="flex flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            input.onAddParticipant();
          }}
        >
          <AdminDialogBody>
            <div className="flex items-end gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <label className="text-sm font-medium" htmlFor="internal-chat-manage-participant">
                  Participante
                </label>
                <Select
                  value={input.availableParticipantId || '__none__'}
                  onValueChange={(value) => input.onAvailableParticipantIdChange(value === '__none__' ? '' : value)}
                >
                  <SelectTrigger id="internal-chat-manage-participant" className="w-full">
                    <SelectValue>
                      {input.availableParticipants.find((participant) => participant.accountId === input.availableParticipantId)?.displayName ?? 'Selecione um participante'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Selecione um participante</SelectItem>
                    {input.availableParticipants.map((participant) => (
                      <SelectItem key={participant.accountId} value={participant.accountId}>
                        {participant.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="internal-chat-manage-participant-role">
                  Admin
                </label>
                <div className="flex h-9 items-center">
                  <Switch
                    id="internal-chat-manage-participant-role"
                    checked={input.availableParticipantRole === 'admin'}
                    onCheckedChange={(checked) => input.onAvailableParticipantRoleChange(checked ? 'admin' : 'normal')}
                  />
                </div>
              </div>
              <AdminButton type="submit" variant="outline" size="icon-sm">
                <Check className="h-4 w-4" />
                <span className="sr-only">Incluir participante</span>
              </AdminButton>
            </div>

            <div className="space-y-2">
              {input.members.length > 0 ? (
                input.members.map((participant) => (
                  <div key={participant.participantId} className="flex items-center justify-between gap-3 border-b border-border pb-2">
                    <AdminInput value={participant.participantName} disabled />
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>Admin</span>
                        <Switch
                          checked={participant.role === 'admin'}
                          onCheckedChange={(checked) => input.onRoleToggle(participant.participantId, checked)}
                        />
                      </div>
                      <AdminButton
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        onClick={() => input.onRemoveParticipant(participant.participantId)}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Remover participante</span>
                      </AdminButton>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">Nenhum participante.</div>
              )}
            </div>
          </AdminDialogBody>
          <AdminDialogFooter>
            <AdminButton type="button" onClick={() => input.onOpenChange(false)}>
              Fechar
            </AdminButton>
          </AdminDialogFooter>
        </form>
      </AdminDialogContent>
    </Dialog>
  );
}
