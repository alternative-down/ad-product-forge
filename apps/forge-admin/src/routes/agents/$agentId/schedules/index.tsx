import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';

import {
  AdminButton,
  AdminLoadingState,
  PageHeader,
} from '@/components/admin';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { createSchedule, deleteSchedule, getAgent, updateSchedule } from '@/lib/admin-api/index';
import { failAdminAction, startAdminAction, succeedAdminAction } from '@/lib/admin-toast';

import { ScheduleDialog } from '../../components/agents/schedules/schedule-dialog';
import { createEmptyScheduleForm, createScheduleForm, formatDateTime, type ScheduleForm } from '../../components/agents/schedules/scheduleHelpers';

export const Route = createFileRoute('/agents/$agentId/schedules/')({
  component: AgentSchedulesIndexRoute,
});

function AgentSchedulesIndexRoute() {
  const { agentId } = Route.useParams();
  const queryClient = useQueryClient();
  const resolveWakeWhenRunning = (current: ScheduleForm) =>
    current.kind === 'heartbeat'
      ? false
      : current.scheduleType === 'cron'
        ? current.wakeWhenRunning
        : true;
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
          wakeWhenRunning: resolveWakeWhenRunning(current),
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
        wakeWhenRunning: resolveWakeWhenRunning(current),
      });
    },
    onMutate: (current) =>
      startAdminAction(current.scheduleId ? 'Salvando agendamento...' : 'Criando agendamento...'),
    onSuccess: async (_data, current, context) => {
      succeedAdminAction(context, current.scheduleId ? 'Agendamento atualizado.' : 'Agendamento criado.');
      setDialogOpen(false);
      setForm(createEmptyScheduleForm());
      await queryClient.invalidateQueries({ queryKey: ['admin', 'agent', agentId] });
    },
    onError: (error, _variables, context) => {
      failAdminAction(context, error);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (scheduleId: string) => deleteSchedule(agentId, scheduleId),
    onMutate: () => startAdminAction('Excluindo agendamento...'),
    onSuccess: async (_data, _variables, context) => {
      succeedAdminAction(context, 'Agendamento excluído.');
      await queryClient.invalidateQueries({ queryKey: ['admin', 'agent', agentId] });
    },
    onError: (error, _variables, context) => {
      failAdminAction(context, error);
    },
  });
  const schedules = agentQuery.data?.schedules ?? [];
  const heartbeat = agentQuery.data?.heartbeat ?? null;

  return (
    <div className="min-w-0 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {agentQuery.isLoading && !agentQuery.data ? <AdminLoadingState label="Carregando agendamentos..." /> : null}
      <PageHeader title="Agendamentos" />

      {heartbeat ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-lg font-semibold tracking-[-0.03em]">Heartbeat</div>
            <AdminButton
              variant="ghost"
              size="icon"
              onClick={() => {
                setForm(createScheduleForm(heartbeat));
                setDialogOpen(true);
              }}
            >
              <Pencil className="h-4 w-4" />
              <span className="sr-only">Editar heartbeat</span>
            </AdminButton>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm text-muted-foreground">
            <div>
              <div className="font-medium text-foreground">Status</div>
              <div>{heartbeat.isActive ? 'Ativo' : 'Inativo'}</div>
            </div>
            <div>
              <div className="font-medium text-foreground">Próximo</div>
              <div>{heartbeat.nextTriggerAt ? formatDateTime(heartbeat.nextTriggerAt) : '—'}</div>
            </div>
            <div>
              <div className="font-medium text-foreground">Cron</div>
              <div>{heartbeat.cronExpression ?? '—'}</div>
            </div>
            <div>
              <div className="font-medium text-foreground">Timezone</div>
              <div>{heartbeat.timezone}</div>
            </div>
            <div>
              <div className="font-medium text-foreground">Entrega</div>
              <div>Só quando ocioso</div>
            </div>
          </div>

          <div className="text-sm text-muted-foreground">{heartbeat.content || 'Sem conteúdo configurado.'}</div>
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
                <TableHead className="px-4 py-3 font-medium">Wake em execução</TableHead>
                <TableHead className="px-4 py-3 font-medium">Próximo</TableHead>
                <TableHead className="px-4 py-3 text-right font-medium">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedules.map((schedule) => (
                <TableRow key={schedule.scheduleId}>
                  <TableCell className="px-4 py-3">{schedule.name}</TableCell>
                  <TableCell className="px-4 py-3">{schedule.scheduleType === 'cron' ? 'Cron' : 'Data'}</TableCell>
                  <TableCell className="px-4 py-3">
                    {schedule.scheduleType === 'cron'
                      ? schedule.wakeWhenRunning ? 'Sim' : 'Só ocioso'
                      : '—'}
                  </TableCell>
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
                  <TableCell className="px-4 py-6 text-muted-foreground" colSpan={5}>
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

      <ScheduleDialog
        open={dialogOpen}
        pending={mutation.isPending}
        form={form}
        onOpenChange={setDialogOpen}
        onFormChange={setForm}
        onSubmit={() => mutation.mutate(form)}
      />
    </div>
  );
}
