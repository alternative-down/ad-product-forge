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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import type { AgentProfileForm } from './-agent-detail-helpers';

export function agent-profile-dialog(input: {
  open: boolean;
  pending: boolean;
  form: AgentProfileForm | null;
  roles: Array<{ roleId: string; name: string }>;
  profiles: Array<{ profileId: string; name: string }>;
  errorMessage?: string;
  onOpenChange(open: boolean): void;
  onFormChange(updater: (current: AgentProfileForm) => AgentProfileForm): void;
  onSubmit(): void;
}) {
  const form = input.form;
  const selectedRoleName =
    input.roles.find((role) => role.roleId === form?.roleId)?.name ?? 'Sem papel';
  const selectedModelProfileName =
    input.profiles.find((profile) => profile.profileId === form?.modelProfileId)?.name ?? 'Selecione um perfil';
  const selectedOmProfileName =
    input.profiles.find((profile) => profile.profileId === form?.omModelProfileId)?.name ?? 'Selecione um perfil';

  return (
    <Dialog open={input.open} onOpenChange={input.onOpenChange}>
      <AdminDialogContent>
        <AdminDialogHeader>
          <AdminDialogTitle>Editar agente</AdminDialogTitle>
        </AdminDialogHeader>

        {form ? (
          <form
            className="flex flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              input.onSubmit();
            }}
          >
            <AdminDialogBody>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="agent-name">
                  Nome
                </label>
                <AdminInput
                  id="agent-name"
                  value={form.name}
                  onChange={(event) => input.onFormChange((current) => ({ ...current, name: event.target.value }))}
                  disabled={input.pending}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="agent-role">
                  Papel
                </label>
                <Select
                  value={form.roleId || '__none__'}
                  onValueChange={(value) =>
                    input.onFormChange((current) => ({ ...current, roleId: value === '__none__' ? '' : value }))
                  }
                  disabled={input.pending}
                >
                  <SelectTrigger id="agent-role" className="w-full">
                    <SelectValue>{selectedRoleName}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem papel</SelectItem>
                    {input.roles.map((role) => (
                      <SelectItem key={role.roleId} value={role.roleId}>
                        {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="agent-description">
                  Descrição
                </label>
                <AdminTextarea
                  id="agent-description"
                  value={form.description}
                  onChange={(event) => input.onFormChange((current) => ({ ...current, description: event.target.value }))}
                  disabled={input.pending}
                  rows={4}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="agent-model-profile">
                    Perfil principal
                  </label>
                  <Select
                    value={form.modelProfileId}
                    onValueChange={(value) =>
                      input.onFormChange((current) => ({ ...current, modelProfileId: value }))
                    }
                    disabled={input.pending}
                  >
                    <SelectTrigger id="agent-model-profile" className="w-full">
                      <SelectValue>{selectedModelProfileName}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {input.profiles.map((profile) => (
                        <SelectItem key={profile.profileId} value={profile.profileId}>
                          {profile.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="agent-om-profile">
                    Perfil OM
                  </label>
                  <Select
                    value={form.omModelProfileId}
                    onValueChange={(value) =>
                      input.onFormChange((current) => ({ ...current, omModelProfileId: value }))
                    }
                    disabled={input.pending}
                  >
                    <SelectTrigger id="agent-om-profile" className="w-full">
                      <SelectValue>{selectedOmProfileName}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {input.profiles.map((profile) => (
                        <SelectItem key={profile.profileId} value={profile.profileId}>
                          {profile.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="agent-instructions">
                  Instruções
                </label>
                <AdminTextarea
                  id="agent-instructions"
                  value={form.instructions}
                  onChange={(event) => input.onFormChange((current) => ({ ...current, instructions: event.target.value }))}
                  disabled={input.pending}
                  rows={10}
                />
              </div>

              {input.errorMessage ? <div className="text-sm text-destructive">{input.errorMessage}</div> : null}
            </AdminDialogBody>

            <AdminDialogFooter>
              <AdminButton
                type="submit"
                disabled={
                  input.pending ||
                  !form.name.trim() ||
                  !form.instructions.trim() ||
                  !form.modelProfileId ||
                  !form.omModelProfileId
                }
              >
                {input.pending ? 'Salvando...' : 'Salvar'}
              </AdminButton>
            </AdminDialogFooter>
          </form>
        ) : null}
      </AdminDialogContent>
    </Dialog>
  );
}
