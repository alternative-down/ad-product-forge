import type { HTMLAttributes } from 'react';

import { cn } from '../../lib/utils';

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border border-[color:var(--panel-border-strong)] bg-[color:var(--panel-muted)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted-strong)]',
        className,
      )}
      {...props}
    />
  );
}
