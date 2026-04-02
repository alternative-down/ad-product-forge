import type { ReactNode } from 'react';

export function PageHeader(input: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 pb-2 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {input.eyebrow ? (
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            {input.eyebrow}
          </div>
        ) : null}
        <h1 className="mt-1 text-4xl font-semibold tracking-[-0.06em]">{input.title}</h1>
        {input.description ? (
          <p className="mt-3 max-w-3xl text-base text-muted-foreground">{input.description}</p>
        ) : null}
      </div>
      {input.actions ? <div className="flex items-center gap-2">{input.actions}</div> : null}
    </div>
  );
}
