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

export function rename-conversation-dialog(input: {
  open: boolean;
  groupNameDraft: string;
  onOpenChange(open: boolean): void;
  onGroupNameDraftChange(value: string): void;
  onSubmit(): void;
}) {
  return (
    <Dialog open={input.open} onOpenChange={input.onOpenChange}>
      <AdminDialogContent>
        <AdminDialogHeader>
          <AdminDialogTitle>Editar conversa</AdminDialogTitle>
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
              <label className="text-sm font-medium" htmlFor="home-conversation-name">
                Nome do grupo
              </label>
              <AdminInput
                id="home-conversation-name"
                value={input.groupNameDraft}
                onChange={(event) => input.onGroupNameDraftChange(event.target.value)}
              />
            </div>
          </AdminDialogBody>
          <AdminDialogFooter>
            <AdminButton type="submit">Salvar</AdminButton>
          </AdminDialogFooter>
        </form>
      </AdminDialogContent>
    </Dialog>
  );
}
