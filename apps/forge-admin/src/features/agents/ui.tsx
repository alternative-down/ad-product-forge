import type { ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';
import { Card } from '../../components/ui/card';
import { cn } from '../../lib/utils';

export function ReadOnlyField(input: { label: string; value: string; wrap?: boolean }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {input.label}
      </div>
      <div className={cn('mt-1 text-sm', input.wrap && 'break-all')}>{input.value}</div>
    </div>
  );
}

export function LabeledField(input: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('grid gap-2 text-sm', input.className)}>
      <span className="font-medium">{input.label}</span>
      {input.children}
    </label>
  );
}

export function PanelLoading(input: { label: string }) {
  return (
    <Card className="flex items-center gap-3 p-6 text-sm">
      <LoaderCircle className="h-4 w-4 animate-spin" />
      {input.label}
    </Card>
  );
}

export function PanelError(input: { message: string }) {
  return <Card className="border-red-200 bg-red-50 p-6 text-sm text-red-700">{input.message}</Card>;
}

export function CompactStat(input: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-[color:var(--panel-border)] px-3 py-2 last:border-b-0">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{input.label}</span>
      <span className="text-sm font-semibold">{input.value}</span>
    </div>
  );
}
