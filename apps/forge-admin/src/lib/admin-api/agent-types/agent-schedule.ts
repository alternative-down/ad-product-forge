export type AgentSchedule = {

  scheduleId: string;

  kind: 'agent' | 'heartbeat';

  name: string;

  description?: string;

  scheduleType: 'cron' | 'date';

  cronExpression?: string;

  scheduledDate?: number;

  timezone: string;

  content: string;

  wakeWhenRunning: boolean;

  isActive: boolean;

  lastTriggeredAt?: number;

  nextTriggerAt?: number;

  createdAt?: number;

  updatedAt?: number;

};


