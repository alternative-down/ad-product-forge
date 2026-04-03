import type { ReactNode } from 'react';

export function PageHeader(input: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex max-w-full flex-row items-end justify-between gap-3 pb-2">
      <div className="min-w-0">
        {input.eyebrow ? (
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            {input.eyebrow}
          </div>
        ) : null}
        <h1 className="mt-1 text-3xl font-semibold tracking-[-0.06em] sm:text-4xl">{input.title}</h1>
        {input.description ? (
          <p className="mt-3 max-w-3xl text-base text-muted-foreground">{input.description}</p>
        ) : null}
      </div>
      {input.actions ? <div className="flex shrink-0 items-center gap-2">{input.actions}</div> : null}
    </div>
  );
}
