import type { ReactNode } from 'react';

import { cn } from '../../lib/utils';

export function PageHeader(input: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'border-b border-[color:var(--panel-border)] pb-6',
        input.className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <span className="inline-flex items-center rounded-sm bg-[color:var(--panel-muted)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-[color:var(--muted-strong)]">
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
        {input.actions ? <div className="flex flex-wrap items-center gap-3">{input.actions}</div> : null}
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
