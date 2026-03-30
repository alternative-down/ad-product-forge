import { useState } from 'react';
import { Calendar, Clock, LoaderCircle, Plus } from 'lucide-react';
import { cn } from '../../../../lib/utils';
import { Button } from '../../../../components/ui/button';
import { Card } from '../../../../components/ui/card';
import { Input } from '../../../../components/ui/input';
import { LabeledField } from '../../ui';
import { toDateTimeLocalValue, formatDateTimeText, createEmptyScheduleDraft } from '../../utils';

export function SchedulesCard(input: {
  schedules: Array<{
    scheduleId: string;
    name: string;
    cronExpression: string | null;
    scheduledDate: string | null;
    timezone: string;
    isActive: boolean;
    lastRunAt: string | null;
    nextRunAt: string | null;
  }>;
  pending: boolean;
  onCreateSchedule(schedule: { name: string; cronExpression: string | null; scheduledDate: string | null; timezone: string }): void;
  onToggleSchedule(scheduleId: string, isActive: boolean): void;
  onDeleteSchedule(scheduleId: string): void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState(createEmptyScheduleDraft());

  const handleSubmit = () => {
    input.onCreateSchedule({
      name: draft.name,
      cronExpression: draft.cronExpression,
      scheduledDate: draft.scheduledDate,
      timezone: draft.timezone,
    });
    setDraft(createEmptyScheduleDraft());
    setShowForm(false);
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Schedules</h2>
        </div>
        <Button className="h-8 px-3 text-xs" onClick={() => setShowForm(!showForm)} disabled={input.pending}>
          <Plus className="mr-1 h-3 w-3" />
          Add schedule
        </Button>
      </div>

      {showForm && (
        <form
          className="mt-4 space-y-4 rounded-lg border border-[color:var(--panel-border)] bg-[color:var(--panel-strong)] p-4"
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          <LabeledField label="Name">
            <Input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Daily check-in"
              required
            />
          </LabeledField>

          <LabeledField label="Schedule type">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDraft({ ...draft, scheduleType: 'cron' })}
                className={cn(
                  'rounded-lg border px-4 py-2 text-sm transition',
                  draft.scheduleType === 'cron'
                    ? 'border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--accent)]'
                    : 'border-[color:var(--panel-border-strong)] bg-[color:var(--panel)] text-[color:var(--muted)] hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]',
                )}
              >
                Cron
              </button>
              <button
                type="button"
                onClick={() => setDraft({ ...draft, scheduleType: 'date', scheduledDate: new Date().toISOString() })}
                className={cn(
                  'rounded-lg border px-4 py-2 text-sm transition',
                  draft.scheduleType === 'date'
                    ? 'border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--accent)]'
                    : 'border-[color:var(--panel-border-strong)] bg-[color:var(--panel)] text-[color:var(--muted)] hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]',
                )}
              >
                One-time
              </button>
            </div>
          </LabeledField>

          {draft.scheduleType === 'cron' ? (
            <LabeledField label="Cron expression">
              <Input
                value={draft.cronExpression ?? ''}
                onChange={(e) => setDraft({ ...draft, cronExpression: e.target.value })}
                placeholder="0 9 * * 1-5"
              />
            </LabeledField>
          ) : (
            <LabeledField label="Date & time">
              <Input
                type="datetime-local"
                value={draft.scheduledDate ? toDateTimeLocalValue(draft.scheduledDate) : ''}
                onChange={(e) => setDraft({ ...draft, scheduledDate: new Date(e.target.value).toISOString() })}
              />
            </LabeledField>
          )}

          <LabeledField label="Timezone">
            <Input
              value={draft.timezone}
              onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}
              placeholder="UTC"
            />
          </LabeledField>

          <div className="flex gap-2">
            <Button type="submit" disabled={input.pending}>
              {input.pending ? (
                <>
                  <LoaderCircle className="mr-1 h-3 w-3 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create'
              )}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      <div className="mt-4 space-y-3">
        {input.schedules.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No schedules configured.</div>
        ) : (
          input.schedules.map((schedule) => (
            <div
              key={schedule.scheduleId}
              className="flex items-center justify-between rounded-lg border border-[color:var(--panel-border)] bg-[color:var(--panel-strong)] p-4"
            >
              <div>
                <div className="font-medium text-[color:var(--ink)]">{schedule.name}</div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[color:var(--muted)]">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {schedule.cronExpression ?? (schedule.scheduledDate ? formatDateTimeText(schedule.scheduledDate) : '—')}
                  </span>
                  <span>{schedule.timezone}</span>
                  {schedule.nextRunAt && <span>Next: {formatDateTimeText(schedule.nextRunAt)}</span>}
                  {schedule.lastRunAt && <span>Last: {formatDateTimeText(schedule.lastRunAt)}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => input.onToggleSchedule(schedule.scheduleId, !schedule.isActive)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition',
                    schedule.isActive
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-[color:var(--panel-border-strong)] bg-[color:var(--panel)] text-[color:var(--muted)]',
                  )}
                >
                  {schedule.isActive ? 'Active' : 'Paused'}
                </button>
                <Button
                  variant="ghost"
                  onClick={() => input.onDeleteSchedule(schedule.scheduleId)}
                  disabled={input.pending}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
