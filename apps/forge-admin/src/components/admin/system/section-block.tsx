import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export function SectionBlock(input: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  quiet?: boolean;
  className?: string;
}) {
  return (
    <section
      className={cn(
        input.quiet ? 'rounded-xl border border-border bg-muted/35' : 'rounded-xl border border-border bg-card',
        'p-5 md:p-6',
        input.className,
      )}
    >
      {input.title || input.description || input.actions ? (
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            {input.title ? <h2 className="text-base font-semibold tracking-[-0.02em]">{input.title}</h2> : null}
            {input.description ? <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{input.description}</p> : null}
          </div>
          {input.actions ? <div className="flex items-center gap-2">{input.actions}</div> : null}
        </div>
      ) : null}
      {input.children}
    </section>
  );
}
