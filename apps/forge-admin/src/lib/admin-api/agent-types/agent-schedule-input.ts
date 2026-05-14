export type CreateScheduleInput = {

  agentId: string;

  name: string;

  description?: string;

  scheduleType: 'cron' | 'date';

  cronExpression?: string;

  scheduledDate?: string;

  timezone: string;

  content: string;

  wakeWhenRunning?: boolean;

};



export type UpdateScheduleInput = {

  agentId: string;

  scheduleId: string;

  name?: string;

  description?: string | null;

  scheduleType?: 'cron' | 'date';

  cronExpression?: string | null;

  scheduledDate?: string | null;

  timezone?: string;

  content?: string;

  wakeWhenRunning?: boolean;

  isActive?: boolean;

};


