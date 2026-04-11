import type { AgentSchedule } from '@/lib/admin-api';

export type ScheduleForm = {
  scheduleId?: string;
  kind?: 'agent' | 'heartbeat';
  name: string;
  description: string;
  scheduleType: 'cron' | 'date';
  cronExpression: string;
  scheduledDate: string;
  timezone: string;
  content: string;
  wakeWhenRunning: boolean;
  isActive: boolean;
};

export function createEmptyScheduleForm(): ScheduleForm {
  return {
    name: '',
    description: '',
    scheduleType: 'cron',
    cronExpression: '',
    scheduledDate: '',
    timezone: 'America/Sao_Paulo',
    content: '',
    wakeWhenRunning: true,
    isActive: true,
  };
}

export function createScheduleForm(schedule: AgentSchedule): ScheduleForm {
  return {
    scheduleId: schedule.scheduleId,
    kind: schedule.kind,
    name: schedule.name,
    description: schedule.description ?? '',
    scheduleType: schedule.scheduleType,
    cronExpression: schedule.cronExpression ?? '',
    scheduledDate: schedule.scheduledDate ? toDateTimeLocalValue(schedule.scheduledDate) : '',
    timezone: schedule.timezone,
    content: schedule.content,
    wakeWhenRunning: schedule.wakeWhenRunning,
    isActive: schedule.isActive,
  };
}

export function formatDateTime(value: number) {
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
