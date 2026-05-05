import { Check } from 'lucide-react';

import {
  AdminButton,
  AdminDialogBody,
  AdminDialogContent,
  AdminDialogFooter,
  AdminDialogHeader,
  AdminDialogTitle,
  AdminInput,
} from '@/components/admin';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Dialog } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getInitials, type ConversationForm, type InternalChatContact } from './-context';

export function NewConversationDialog(input: {
  open: boolean;
  selectedAccount: boolean;
  form: ConversationForm;
  contacts: InternalChatContact[];
  onOpenChange(open: boolean): void;
  onFormChange(value: ConversationForm): void;
  onSubmit(): void;
}) {
  const filteredContacts = input.contacts.filter((contact) => {
    const query = input.form.participantQuery.trim().toLowerCase();

    if (!query) {
      return true;
    }

    return (
      contact.displayName.toLowerCase().includes(query) ||
      contact.slug.toLowerCase().includes(query)
    );
  });

  return (
    <Dialog open={input.open} onOpenChange={input.onOpenChange}>
      <AdminDialogContent>
        <AdminDialogHeader>
          <AdminDialogTitle>Nova conversa</AdminDialogTitle>
        </AdminDialogHeader>

        <form
          className="flex flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            input.onSubmit();
          }}
        >
          <AdminDialogBody>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="internal-chat-conversation-type">
                Tipo
              </label>
              <Select
                value={input.form.type}
                onValueChange={(value: 'dm' | 'group') =>
                  input.onFormChange({
                    ...input.form,
                    type: value,
                    selectedParticipantIds: [],
                  })
                }
              >
                <SelectTrigger id="internal-chat-conversation-type" className="w-full">
                  <SelectValue>{input.form.type === 'dm' ? 'DM' : 'Grupo'}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dm">DM</SelectItem>
                  <SelectItem value="group">Grupo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {input.form.type === 'group' ? (
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="internal-chat-conversation-name">
                  Nome do grupo
                </label>
                <AdminInput
                  id="internal-chat-conversation-name"
                  value={input.form.name}
                  onChange={(event) => input.onFormChange({ ...input.form, name: event.target.value })}
                />
              </div>
            ) : null}

            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="internal-chat-conversation-participant-filter">
                  Participantes
                </label>
                <AdminInput
                  id="internal-chat-conversation-participant-filter"
                  value={input.form.participantQuery}
                  onChange={(event) =>
                    input.onFormChange({ ...input.form, participantQuery: event.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                {filteredContacts.length > 0 ? (
                  filteredContacts.map((contact) => {
                    const selected = input.form.selectedParticipantIds.includes(contact.accountId);

                    return (
                      <button
                        key={contact.accountId}
                        type="button"
                        onClick={() =>
                          input.onFormChange({
                            ...input.form,
                            selectedParticipantIds:
                              input.form.type === 'dm'
                                ? [contact.accountId]
                                : selected
                                  ? input.form.selectedParticipantIds.filter((value) => value !== contact.accountId)
                                  : [...input.form.selectedParticipantIds, contact.accountId],
                          })
                        }
                        className={
                          selected
                            ? 'flex w-full items-center gap-3 rounded-sm border border-border bg-muted px-3 py-3 text-left'
                            : 'flex w-full items-center gap-3 rounded-sm border border-border bg-background px-3 py-3 text-left'
                        }
                      >
                        <Avatar className="h-9 w-9 border border-border bg-muted">
                          <AvatarFallback className="bg-muted text-xs font-medium text-foreground">
                            {getInitials(contact.displayName)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 space-y-0.5">
                          <div className="truncate text-sm font-medium text-foreground">{contact.displayName}</div>
                          <div className="truncate text-xs text-muted-foreground">@{contact.slug}</div>
                        </div>
                        <div className="ml-auto text-muted-foreground">
                          {selected ? <Check className="h-4 w-4" /> : null}
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="text-sm text-muted-foreground">Nenhum participante encontrado.</div>
                )}
              </div>
            </div>
          </AdminDialogBody>

          <AdminDialogFooter>
            <AdminButton
              type="submit"
              disabled={
                !input.selectedAccount ||
                (input.form.type === 'dm'
                  ? input.form.selectedParticipantIds.length !== 1
                  : input.form.selectedParticipantIds.length === 0)
              }
            >
              Criar
            </AdminButton>
          </AdminDialogFooter>
        </form>
      </AdminDialogContent>
    </Dialog>
  );
}
