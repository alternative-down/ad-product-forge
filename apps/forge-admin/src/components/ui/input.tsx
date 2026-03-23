import type { InputHTMLAttributes } from 'react';

import { cn } from '../../lib/utils';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-11 w-full rounded-lg border border-[color:var(--panel-border-strong)] bg-[color:var(--panel-strong)] px-4 text-sm text-[color:var(--ink)] outline-none transition placeholder:text-[color:var(--muted)] focus:border-[color:var(--accent)] focus:ring-4 focus:ring-[color:var(--accent-soft)]',
        className,
      )}
      {...props}
    />
  );
}
