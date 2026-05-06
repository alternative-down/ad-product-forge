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
import { Switch } from '@/components/ui/switch';

import type { ScheduleForm } from './-schedule-helpers';

export function ScheduleDialog(input: {
  open: boolean;
  pending: boolean;
  form: ScheduleForm;
  onOpenChange(open: boolean): void;
  onFormChange(value: ScheduleForm): void;
  onSubmit(): void;
}) {
  const requiresContent = !(input.form.scheduleId && input.form.kind === 'heartbeat');

  return (
    <Dialog open={input.open} onOpenChange={input.onOpenChange}>
      <AdminDialogContent>
        <AdminDialogHeader>
          <AdminDialogTitle>{input.form.scheduleId ? 'Editar agendamento' : 'Novo agendamento'}</AdminDialogTitle>
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
                <label className="text-sm font-medium" htmlFor="schedule-name">
                  Nome
                </label>
                <AdminInput
                  id="schedule-name"
                  value={input.form.name}
                  onChange={(event) => input.onFormChange({ ...input.form, name: event.target.value })}
                  disabled={input.pending}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="schedule-description">
                  Descrição
                </label>
                <AdminTextarea
                  id="schedule-description"
                  rows={4}
                  value={input.form.description}
                  onChange={(event) => input.onFormChange({ ...input.form, description: event.target.value })}
                  disabled={input.pending}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="schedule-type">
                    Tipo
                  </label>
                  <Select
                    value={input.form.scheduleType}
                    onValueChange={(value: 'cron' | 'date') => input.onFormChange({ ...input.form, scheduleType: value })}
                    disabled={input.pending}
                  >
                    <SelectTrigger id="schedule-type" className="w-full">
                      <SelectValue>{input.form.scheduleType === 'cron' ? 'Cron' : 'Data'}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cron">Cron</SelectItem>
                      <SelectItem value="date">Data</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="schedule-timezone">
                    Timezone
                  </label>
                  <AdminInput
                    id="schedule-timezone"
                    value={input.form.timezone}
                    onChange={(event) => input.onFormChange({ ...input.form, timezone: event.target.value })}
                    disabled={input.pending}
                  />
                </div>
              </div>

              {input.form.scheduleType === 'cron' ? (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="schedule-cron">
                      Expressão cron
                    </label>
                    <AdminInput
                      id="schedule-cron"
                      value={input.form.cronExpression}
                      onChange={(event) => input.onFormChange({ ...input.form, cronExpression: event.target.value })}
                      disabled={input.pending}
                    />
                  </div>
                  {input.form.kind !== 'heartbeat' ? (
                    <label className="flex items-center justify-between gap-4 rounded-sm border border-border px-4 py-3">
                      <div className="space-y-1">
                        <div className="text-sm font-medium">Wake enquanto executa</div>
                        <div className="text-xs leading-relaxed text-muted-foreground">
                          Se desligado, o conteúdo deste cron só entra no flushing quando o agente estiver ocioso, como no heartbeat.
                        </div>
                      </div>
                      <Switch
                        checked={input.form.wakeWhenRunning}
                        onCheckedChange={(checked) => input.onFormChange({ ...input.form, wakeWhenRunning: checked })}
                        disabled={input.pending}
                      />
                    </label>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="schedule-date">
                    Data
                  </label>
                  <AdminInput
                    id="schedule-date"
                    type="datetime-local"
                    value={input.form.scheduledDate}
                    onChange={(event) => input.onFormChange({ ...input.form, scheduledDate: event.target.value })}
                    disabled={input.pending}
                  />
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="schedule-content">
                  Conteúdo
                </label>
                <AdminTextarea
                  id="schedule-content"
                  rows={6}
                  value={input.form.content}
                  onChange={(event) => input.onFormChange({ ...input.form, content: event.target.value })}
                  disabled={input.pending}
                />
              </div>

              {input.form.scheduleId ? (
                <label className="flex items-center justify-between gap-4 rounded-sm border border-border px-4 py-3">
                  <span className="text-sm font-medium">Ativo</span>
                  <Switch
                    checked={input.form.isActive}
                    onCheckedChange={(checked) => input.onFormChange({ ...input.form, isActive: checked })}
                    disabled={input.pending}
                  />
                </label>
              ) : null}
            </div>
          </AdminDialogBody>

          <AdminDialogFooter>
            <AdminButton
              type="submit"
              disabled={
                input.pending ||
                !input.form.name.trim() ||
                (requiresContent && !input.form.content.trim()) ||
                !input.form.timezone.trim() ||
                (input.form.scheduleType === 'cron' ? !input.form.cronExpression.trim() : !input.form.scheduledDate)
              }
            >
              {input.pending ? 'Salvando...' : 'Salvar'}
            </AdminButton>
          </AdminDialogFooter>
        </form>
      </AdminDialogContent>
    </Dialog>
  );
}
