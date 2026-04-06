import type { AgentSchedule } from '@/lib/admin-api';

export type ScheduleForm = {
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

export function createEmptyScheduleForm(): ScheduleForm {
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

export function createScheduleForm(schedule: AgentSchedule): ScheduleForm {
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
