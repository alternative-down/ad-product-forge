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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Dialog } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';

import { normalizeRoleFormToolIds, type RoleForm } from './roles-page-helpers';

function toggleRoleToolIds(toolIds: string[], toolId: string, checked: boolean) {
  const nextToolIds = checked ? [...toolIds, toolId] : toolIds.filter((currentToolId) => currentToolId !== toolId);
  return normalizeRoleFormToolIds(nextToolIds);
}

export function RoleDialog(input: {
  open: boolean;
  pending: boolean;
  form: RoleForm;
  lockedToolIds: string[];
  toolSections: Array<{ title: string; toolIds: string[] }>;
  errorMessage?: string;
  onOpenChange(open: boolean): void;
  onFormChange(value: RoleForm): void;
  onSubmit(): void;
}) {
  return (
    <Dialog open={input.open} onOpenChange={input.onOpenChange}>
      <AdminDialogContent>
        <AdminDialogHeader>
          <AdminDialogTitle>{input.form.roleId ? 'Editar papel' : 'Novo papel'}</AdminDialogTitle>
        </AdminDialogHeader>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            input.onSubmit();
          }}
        >
          <AdminDialogBody>
            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="role-name">
                  Nome
                </label>
                <AdminInput
                  id="role-name"
                  value={input.form.name}
                  onChange={(event) => input.onFormChange({ ...input.form, name: event.target.value })}
                  disabled={input.pending}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="role-description">
                  Descrição
                </label>
                <AdminTextarea
                  id="role-description"
                  rows={5}
                  value={input.form.description}
                  onChange={(event) => input.onFormChange({ ...input.form, description: event.target.value })}
                  disabled={input.pending}
                />
              </div>

              <div className="space-y-3">
                <div className="text-sm font-medium">Capacidades</div>

                <Accordion className="space-y-3">
                  {input.toolSections.map((section) => (
                    <AccordionItem key={section.title} value={section.title} className="overflow-hidden rounded-sm border border-border">
                      <AccordionTrigger className="px-4 py-3 hover:no-underline">
                        <div className="flex items-center gap-3">
                          <span>{section.title}</span>
                          <span className="text-xs text-muted-foreground">{section.toolIds.length}</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pb-0">
                        <div className="border-t border-border">
                          {section.toolIds.map((toolId) => {
                            const enabled = input.form.capabilityIds.includes(toolId);
                            const locked = input.lockedToolIds.includes(toolId);

                            return (
                              <label
                                key={toolId}
                                className="flex items-center justify-between gap-4 px-4 py-3 not-last:border-b not-last:border-border"
                              >
                                <div className="min-w-0 space-y-1">
                                  <div className="font-mono text-[13px] break-all">{toolId}</div>
                                  {locked ? <div className="text-xs text-muted-foreground">Sempre ativo</div> : null}
                                </div>
                                <Switch
                                  checked={enabled}
                                  disabled={input.pending || locked}
                                  onCheckedChange={(checked) =>
                                    input.onFormChange({
                                      ...input.form,
                                      capabilityIds: toggleRoleToolIds(input.form.capabilityIds, toolId, checked),
                                    })
                                  }
                                />
                              </label>
                            );
                          })}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>

              {input.errorMessage ? <div className="text-sm text-destructive">{input.errorMessage}</div> : null}
            </div>
          </AdminDialogBody>

          <AdminDialogFooter>
            <AdminButton type="submit" disabled={input.pending || !input.form.name.trim()}>
              {input.pending ? 'Salvando...' : 'Salvar'}
            </AdminButton>
          </AdminDialogFooter>
        </form>
      </AdminDialogContent>
    </Dialog>
  );
}
