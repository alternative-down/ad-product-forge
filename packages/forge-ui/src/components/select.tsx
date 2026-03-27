import type { SelectHTMLAttributes } from 'react';
import { cn } from '../utils';

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'flex h-11 w-full rounded-md border border-[color:var(--panel-border-strong)] bg-[color:var(--panel)] px-3 py-2 text-sm text-[color:var(--ink)] focus:border-[color:var(--accent)] focus:outline-none focus:ring-1 focus:ring-[color:var(--accent)] disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
