import { useState } from 'react';
import { Calendar, Clock, LoaderCircle, Plus } from 'lucide-react';
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
          <Calendar className="h-5 w-5 text-slate-400" />
          <h2 className="text-lg font-semibold text-slate-950">Schedules</h2>
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)} disabled={input.pending}>
          <Plus className="mr-1 h-3 w-3" />
          Add schedule
        </Button>
      </div>

      {showForm && (
        <form
          className="mt-4 space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4"
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
                onClick={() => setDraft({ ...draft, type: 'cron' })}
                className={`rounded-lg border px-4 py-2 text-sm ${
                  draft.type === 'cron'
                    ? 'border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--accent)]'
                    : 'border-slate-200 text-slate-600 hover:bg-white'
                }`}
              >
                Cron
              </button>
              <button
                type="button"
                onClick={() => setDraft({ ...draft, type: 'date', scheduledDate: new Date().toISOString() })}
                className={`rounded-lg border px-4 py-2 text-sm ${
                  draft.type === 'date'
                    ? 'border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--accent)]'
                    : 'border-slate-200 text-slate-600 hover:bg-white'
                }`}
              >
                One-time
              </button>
            </div>
          </LabeledField>

          {draft.type === 'cron' ? (
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
                value={draft.scheduledDate ? toDateTimeLocalValue(new Date(draft.scheduledDate)) : ''}
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
            <Button type="submit" size="sm" disabled={input.pending}>
              {input.pending ? (
                <>
                  <LoaderCircle className="mr-1 h-3 w-3 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create'
              )}
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      <div className="mt-4 space-y-3">
        {input.schedules.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">No schedules configured.</div>
        ) : (
          input.schedules.map((schedule) => (
            <div
              key={schedule.scheduleId}
              className="flex items-center justify-between rounded-lg border border-slate-200 p-4"
            >
              <div>
                <div className="font-medium text-slate-950">{schedule.name}</div>
                <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-slate-500">
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
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    schedule.isActive
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {schedule.isActive ? 'Active' : 'Paused'}
                </button>
                <Button
                  size="sm"
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
