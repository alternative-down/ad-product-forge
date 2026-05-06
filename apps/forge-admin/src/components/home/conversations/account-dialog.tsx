import {
  AdminButton,
  AdminDialogBody,
  AdminDialogContent,
  AdminDialogFooter,
  AdminDialogHeader,
  AdminDialogTitle,
  AdminInput,
  AdminTextarea,
} from '@/components/admin';
import { Dialog } from '@/components/ui/dialog';

import type { AccountDialogMode, AccountForm } from './context';

export function account-dialog(input: {
  open: boolean;
  mode: AccountDialogMode;
  saving: boolean;
  form: AccountForm;
  errorMessage: string;
  onOpenChange(open: boolean): void;
  onFormChange(value: AccountForm): void;
  onDelete?(): void;
  onSubmit(): void;
}) {
  return (
    <Dialog open={input.open} onOpenChange={input.onOpenChange}>
      <AdminDialogContent>
        <AdminDialogHeader>
          <AdminDialogTitle>{input.mode === 'edit' ? 'Editar conta' : 'Nova conta'}</AdminDialogTitle>
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
              <label className="text-sm font-medium" htmlFor="internal-chat-account-name">
                Nome
              </label>
              <AdminInput
                id="internal-chat-account-name"
                value={input.form.displayName}
                onChange={(event) =>
                  input.onFormChange({
                    ...input.form,
                    displayName: event.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="internal-chat-account-slug">
                Usuário
              </label>
              <AdminInput
                id="internal-chat-account-slug"
                value={input.form.slug}
                disabled={input.mode === 'edit'}
                onChange={(event) =>
                  input.onFormChange({
                    ...input.form,
                    slug: event.target.value,
                    slugDirty: true,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="internal-chat-account-description">
                Descrição
              </label>
              <AdminTextarea
                id="internal-chat-account-description"
                rows={4}
                value={input.form.description}
                onChange={(event) =>
                  input.onFormChange({
                    ...input.form,
                    description: event.target.value,
                  })
                }
              />
            </div>
            {input.errorMessage ? (
              <div className="text-sm text-destructive">{input.errorMessage}</div>
            ) : null}
          </AdminDialogBody>
          <AdminDialogFooter>
            {input.mode === 'edit' && input.form.accountId && input.onDelete ? (
              <AdminButton type="button" variant="outline" className="mr-auto" onClick={input.onDelete}>
                Excluir
              </AdminButton>
            ) : null}
            <AdminButton
              type="submit"
              disabled={!input.form.slug.trim() || !input.form.displayName.trim() || input.saving}
            >
              {input.saving ? 'Salvando...' : 'Salvar'}
            </AdminButton>
          </AdminDialogFooter>
        </form>
      </AdminDialogContent>
    </Dialog>
  );
}
