import type { SelectHTMLAttributes } from 'react';

import { cn } from '../../lib/utils';

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-11 w-full rounded-2xl border border-[color:var(--panel-border-strong)] bg-[color:var(--panel-strong)] px-4 text-sm text-[color:var(--ink)] outline-none transition focus:border-[color:var(--accent)] focus:ring-4 focus:ring-[color:var(--accent-soft)]',
        className,
      )}
      {...props}
    />
  );
}
