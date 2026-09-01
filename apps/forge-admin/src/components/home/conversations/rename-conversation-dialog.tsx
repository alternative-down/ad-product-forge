import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AdminDialogBody, AdminDialogContent, AdminDialogFooter, AdminDialogHeader, AdminDialogTitle } from '@/components/admin';
import { Dialog } from '@/components/ui/dialog';

export function RenameConversationDialog(input: {
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
              <Input
                id="home-conversation-name"
                value={input.groupNameDraft}
                onChange={(event) => input.onGroupNameDraftChange(event.target.value)}
              />
            </div>
          </AdminDialogBody>
          <AdminDialogFooter>
            <Button type="submit">Salvar</Button>
          </AdminDialogFooter>
        </form>
      </AdminDialogContent>
    </Dialog>
  );
}
