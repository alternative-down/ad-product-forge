import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';

import {
  AdminButton,
  AdminDialogBody,
  AdminDialogContent,
  AdminDialogFooter,
  AdminDialogHeader,
  AdminDialogTitle,
  AdminInput,
  AdminTextarea,
  PageHeader,
} from '@/components/admin';
import { Dialog } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { createSchedule, deleteSchedule, getAgent, updateSchedule, type AgentSchedule } from '@/lib/admin-api';

export const Route = createFileRoute('/agents/$agentId/schedules/')({
  component: AgentSchedulesIndexRoute,
});

type ScheduleForm = {
  scheduleId?: string;
  name: string;
  description: string;
  scheduleType: 'cron' | 'date';
  cronExpression: string;
  scheduledDate: string;
  timezone: string;
  content: string;
  isActive: boolean;
};

function createEmptyScheduleForm(): ScheduleForm {
  return {
    name: '',
    description: '',
    scheduleType: 'cron',
    cronExpression: '',
    scheduledDate: '',
    timezone: 'America/Sao_Paulo',
    content: '',
    isActive: true,
  };
}

function createScheduleForm(schedule: AgentSchedule): ScheduleForm {
  return {
    scheduleId: schedule.scheduleId,
    name: schedule.name,
    description: schedule.description ?? '',
    scheduleType: schedule.scheduleType,
    cronExpression: schedule.cronExpression ?? '',
    scheduledDate: schedule.scheduledDate ? toDateTimeLocalValue(schedule.scheduledDate) : '',
    timezone: schedule.timezone,
    content: schedule.content,
    isActive: schedule.isActive,
  };
}

function AgentSchedulesIndexRoute() {
  const { agentId } = Route.useParams();
  const queryClient = useQueryClient();
  const agentQuery = useQuery({
    queryKey: ['admin', 'agent', agentId],
    queryFn: () => getAgent(agentId),
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<ScheduleForm>(createEmptyScheduleForm);
  const mutation = useMutation({
    mutationFn: async (current: ScheduleForm) => {
      if (current.scheduleId) {
        return updateSchedule({
          agentId,
          scheduleId: current.scheduleId,
          name: current.name.trim(),
          description: current.description.trim() || null,
          scheduleType: current.scheduleType,
          cronExpression: current.scheduleType === 'cron' ? current.cronExpression.trim() : null,
          scheduledDate: current.scheduleType === 'date' ? current.scheduledDate : null,
          timezone: current.timezone.trim(),
          content: current.content.trim(),
          isActive: current.isActive,
        });
      }

      return createSchedule({
        agentId,
        name: current.name.trim(),
        description: current.description.trim() || undefined,
        scheduleType: current.scheduleType,
        cronExpression: current.scheduleType === 'cron' ? current.cronExpression.trim() : undefined,
        scheduledDate: current.scheduleType === 'date' ? current.scheduledDate : undefined,
        timezone: current.timezone.trim(),
        content: current.content.trim(),
      });
    },
    onSuccess: async () => {
      setDialogOpen(false);
      setForm(createEmptyScheduleForm());
      await queryClient.invalidateQueries({ queryKey: ['admin', 'agent', agentId] });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (scheduleId: string) => deleteSchedule(agentId, scheduleId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'agent', agentId] });
    },
  });
  const schedules = agentQuery.data?.schedules ?? [];
  const heartbeat = agentQuery.data?.heartbeat ?? null;

  return (
    <div className="min-w-0 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <PageHeader title="Agendamentos" />

      {heartbeat ? (
        <section className="space-y-2">
          <div className="text-lg font-semibold tracking-[-0.03em]">Heartbeat</div>
          <div className="text-sm text-muted-foreground">
            {heartbeat.name} · {heartbeat.isActive ? 'Ativo' : 'Inativo'}
            {heartbeat.nextTriggerAt ? ` · Próximo: ${formatDateTime(heartbeat.nextTriggerAt)}` : ''}
          </div>
        </section>
      ) : null}

      <section className="space-y-5">
        <div className="flex justify-end">
          <AdminButton
            onClick={() => {
              setForm(createEmptyScheduleForm());
              setDialogOpen(true);
            }}
          >
            Novo
          </AdminButton>
        </div>

        <div className="w-full min-w-0 overflow-hidden rounded-sm border border-border">
          <Table className="text-sm">
            <TableHeader className="bg-muted/50 text-left text-muted-foreground">
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-4 py-3 font-medium">Nome</TableHead>
                <TableHead className="px-4 py-3 font-medium">Tipo</TableHead>
                <TableHead className="px-4 py-3 font-medium">Próximo</TableHead>
                <TableHead className="px-4 py-3 text-right font-medium">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedules.map((schedule) => (
                <TableRow key={schedule.scheduleId}>
                  <TableCell className="px-4 py-3">{schedule.name}</TableCell>
                  <TableCell className="px-4 py-3">{schedule.scheduleType === 'cron' ? 'Cron' : 'Data'}</TableCell>
                  <TableCell className="px-4 py-3">{schedule.nextTriggerAt ? formatDateTime(schedule.nextTriggerAt) : '—'}</TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <AdminButton
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setForm(createScheduleForm(schedule));
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                        <span className="sr-only">Editar</span>
                      </AdminButton>
                      <AdminButton
                        variant="ghost"
                        size="icon"
                        disabled={deleteMutation.isPending}
                        onClick={() => deleteMutation.mutate(schedule.scheduleId)}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Excluir</span>
                      </AdminButton>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {schedules.length === 0 ? (
                <TableRow>
                  <TableCell className="px-4 py-6 text-muted-foreground" colSpan={4}>
                    Nenhum agendamento ainda.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>

        {agentQuery.error ? <div className="text-sm text-destructive">{agentQuery.error.message}</div> : null}
        {mutation.error ? <div className="text-sm text-destructive">{mutation.error.message}</div> : null}
        {deleteMutation.error ? <div className="text-sm text-destructive">{deleteMutation.error.message}</div> : null}
      </section>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AdminDialogContent>
          <AdminDialogHeader>
            <AdminDialogTitle>{form.scheduleId ? 'Editar agendamento' : 'Novo agendamento'}</AdminDialogTitle>
          </AdminDialogHeader>

          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              mutation.mutate(form);
            }}
          >
            <AdminDialogBody>
              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="schedule-name">
                    Nome
                  </label>
                  <AdminInput id="schedule-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} disabled={mutation.isPending} />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="schedule-description">
                    Descrição
                  </label>
                  <AdminTextarea id="schedule-description" rows={4} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} disabled={mutation.isPending} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="schedule-type">
                      Tipo
                    </label>
                    <Select value={form.scheduleType} onValueChange={(value: 'cron' | 'date') => setForm((current) => ({ ...current, scheduleType: value }))} disabled={mutation.isPending}>
                      <SelectTrigger id="schedule-type" className="w-full">
                        <SelectValue>{form.scheduleType === 'cron' ? 'Cron' : 'Data'}</SelectValue>
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
                    <AdminInput id="schedule-timezone" value={form.timezone} onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))} disabled={mutation.isPending} />
                  </div>
                </div>

                {form.scheduleType === 'cron' ? (
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="schedule-cron">
                      Expressão cron
                    </label>
                    <AdminInput id="schedule-cron" value={form.cronExpression} onChange={(event) => setForm((current) => ({ ...current, cronExpression: event.target.value }))} disabled={mutation.isPending} />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="schedule-date">
                      Data
                    </label>
                    <AdminInput id="schedule-date" type="datetime-local" value={form.scheduledDate} onChange={(event) => setForm((current) => ({ ...current, scheduledDate: event.target.value }))} disabled={mutation.isPending} />
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="schedule-content">
                    Conteúdo
                  </label>
                  <AdminTextarea id="schedule-content" rows={6} value={form.content} onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))} disabled={mutation.isPending} />
                </div>

                {form.scheduleId ? (
                  <label className="flex items-center justify-between gap-4 rounded-sm border border-border px-4 py-3">
                    <span className="text-sm font-medium">Ativo</span>
                    <Switch checked={form.isActive} onCheckedChange={(checked) => setForm((current) => ({ ...current, isActive: checked }))} disabled={mutation.isPending} />
                  </label>
                ) : null}
              </div>
            </AdminDialogBody>

            <AdminDialogFooter>
              <AdminButton
                type="submit"
                disabled={
                  mutation.isPending ||
                  !form.name.trim() ||
                  !form.content.trim() ||
                  !form.timezone.trim() ||
                  (form.scheduleType === 'cron' ? !form.cronExpression.trim() : !form.scheduledDate)
                }
              >
                {mutation.isPending ? 'Salvando...' : 'Salvar'}
              </AdminButton>
            </AdminDialogFooter>
          </form>
        </AdminDialogContent>
      </Dialog>
    </div>
  );
}

function formatDateTime(value: number) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(value);
}

function toDateTimeLocalValue(value: number) {
  const date = new Date(value);
  const offsetMinutes = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offsetMinutes * 60_000);
  return localDate.toISOString().slice(0, 16);
}
