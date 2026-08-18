/**
 * Schedule summary + provider credential crypto helpers for admin/read-model.
 *
 * Extracted from helpers.ts (D49 #6491). Combined into one file because
 * each helper is small (schedule summary ~30 LOC, decryptProviderConfig
 * ~15 LOC) and they are both consumed by agent-types.ts and
 * provider-config loading code respectively.
 */
import type { AgentSchedule } from '../../database/schema';
import { errorMsg } from '../../agents/error-formatting';
import { decryptSecret } from '../../encryption/crypto';
import { adminDebug } from './helpers-debug';

/**
 * Convert agent schedule row to summary object
 */
export function toScheduleSummary(row: AgentSchedule) {
  return {
    scheduleId: row.id,
    kind: row.kind,
    name: row.name,
    description: row.description ?? undefined,
    scheduleType: (row.scheduleType ?? 'cron') as 'cron' | 'date',
    cronExpression: row.cronExpression ?? undefined,
    scheduledDate: row.scheduledDate ?? undefined,
    timezone: row.timezone ?? 'UTC',
    content: row.content ?? '',
    wakeWhenRunning: Boolean(row.wakeWhenRunning),
    isActive: row.isActive != null ? Boolean(row.isActive) : true,
    lastTriggeredAt: row.lastTriggeredAt ?? undefined,
    nextTriggerAt: row.nextTriggerAt ?? undefined,
    createdAt: row.createdAt ?? undefined,
    updatedAt: row.updatedAt ?? undefined,
  };
}

/**
 * Summary shape returned by toScheduleSummary. Defined locally so consumers in
 * forge-admin (agent-types.ts) can declare AgentDetail fields with a matching
 * structural type, removing the (as unknown) cascade at the construction site.
 */
export interface ScheduleSummary {
  scheduleId: string;
  kind: AgentSchedule['kind'];
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
}

/**
 * Decrypt provider credentials stored encrypted in the database and parse
 * the resulting JSON.
 */
export function decryptProviderConfig(encryptedCredentials: string) {
  const decrypted = decryptSecret(encryptedCredentials);

  try {
    return JSON.parse(decrypted) as unknown;
  } catch (err) {
    adminDebug('error', 'Failed to parse credentials JSON: ' + errorMsg(err), { err: errorMsg(err) });
    throw new Error('Failed to parse credentials JSON: ' + errorMsg(err));
  }
}
