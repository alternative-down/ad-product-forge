import type { ReactNode } from 'react';

import { cn } from '../../lib/utils';

export function SectionNav<TValue extends string>(input: {
  value: TValue;
  items: Array<{
    value: TValue;
    label: string;
    detail?: ReactNode;
  }>;
  onChange(value: TValue): void;
  title?: string;
  className?: string;
}) {
  return (
    <aside
      className={cn(
        'rounded-md border border-[color:var(--panel-border)] bg-[color:var(--panel)] p-3',
        input.className,
      )}
    >
      {input.title ? (
        <div className="px-2 pb-3 pt-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-[color:var(--muted-strong)]">
          {input.title}
        </div>
      ) : null}
      <div className="space-y-1">
        {input.items.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => input.onChange(item.value)}
            className={cn(
              'block w-full rounded-md px-3 py-3 text-left transition',
              input.value === item.value
                ? 'bg-[color:var(--bg-deep)] text-white'
                : 'text-[color:var(--ink)] hover:bg-[color:var(--panel-muted)]',
            )}
          >
            <div className="text-sm font-semibold">{item.label}</div>
            {item.detail ? (
              <div
                className={cn(
                  'mt-1 text-xs leading-5',
                  input.value === item.value ? 'text-white/65' : 'text-[color:var(--muted)]',
                )}
              >
                {item.detail}
              </div>
            ) : null}
          </button>
        ))}
      </div>
    </aside>
  );
}

export function WorkspaceCanvas(input: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'rounded-md border border-[color:var(--panel-border)] bg-[color:var(--panel)] p-6 sm:p-8',
        input.className,
      )}
    >
      <div className="flex flex-col gap-4 border-b border-[color:var(--panel-border)] pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold tracking-tight text-[color:var(--ink)]">
            {input.title}
          </h2>
          {input.description ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--muted)]">
              {input.description}
            </p>
          ) : null}
        </div>
        {input.actions ? <div className="shrink-0">{input.actions}</div> : null}
      </div>
      <div className="pt-6">{input.children}</div>
    </section>
  );
}
