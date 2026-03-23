import type { ReactNode } from 'react';

import { cn } from '../../lib/utils';

export function PageHeader(input: {
  eyebrow: string;
  title: string;
  description: string;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-xl border border-[color:var(--panel-border)] bg-[color:var(--panel)] px-6 py-6 shadow-[0_20px_80px_rgba(15,23,42,0.08)] sm:px-8',
        input.className,
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[color:var(--accent)] to-transparent opacity-60" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(260px,0.7fr)] xl:items-end">
        <div className="space-y-3">
          <span className="inline-flex items-center rounded-md border border-[color:var(--panel-border-strong)] bg-[color:var(--panel-muted)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-[color:var(--muted-strong)]">
            {input.eyebrow}
          </span>
          <div className="space-y-2">
            <h1 className="font-serif text-3xl tracking-tight text-[color:var(--ink)] sm:text-4xl">
              {input.title}
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-[color:var(--muted)] sm:text-base">
              {input.description}
            </p>
          </div>
        </div>
        {input.aside ? <div className="xl:justify-self-end">{input.aside}</div> : null}
      </div>
    </section>
  );
}

export function MetricStrip(input: {
  items: Array<{ label: string; value: ReactNode; detail?: ReactNode }>;
  className?: string;
}) {
  return (
    <div className={cn('grid gap-3 sm:grid-cols-2 xl:grid-cols-4', input.className)}>
      {input.items.map((item) => (
        <div
          key={item.label}
          className="rounded-lg border border-[color:var(--panel-border)] bg-[color:var(--panel-muted)] px-4 py-4"
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[color:var(--muted-strong)]">
            {item.label}
          </div>
          <div className="mt-3 text-2xl font-semibold tracking-tight text-[color:var(--ink)]">
            {item.value}
          </div>
          {item.detail ? (
            <div className="mt-2 text-sm text-[color:var(--muted)]">{item.detail}</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
