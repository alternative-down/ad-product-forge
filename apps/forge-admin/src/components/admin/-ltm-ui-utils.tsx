import { ChevronDown } from 'lucide-react';

export function MetricTile({
  label,
  current,
  unit,
  detail,
}: {
  label: string;
  current: number;
  unit?: string;
  detail?: string;
}) {
  return (
    <div className="rounded-2xl border border-border/80 bg-background/70 px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium text-foreground">
        {formatNumber(current)} {unit ?? 'tokens'}
      </div>
      {detail ? (
        <div className="mt-1 text-xs text-muted-foreground">
          {detail}
        </div>
      ) : null}
    </div>
  );
}

export function MemoryDisclosure({
  title,
  value,
}: {
  title: string;
  value: string | null;
}) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-muted-foreground">
        <span>{title}</span>
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
      </summary>
      <div className="pt-3">
        {value ? (
          <div className="max-w-full min-w-0 overflow-x-auto whitespace-pre-wrap break-all rounded-2xl border border-border/80 bg-background/70 p-4 text-xs leading-6 text-foreground [overflow-wrap:anywhere]">
            {value}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">Sem dados.</div>
        )}
      </div>
    </details>
  );
}

export function formatDateTime(value: number) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(value);
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat('pt-BR').format(value);
}
