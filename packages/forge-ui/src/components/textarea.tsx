import type { TextareaHTMLAttributes } from 'react';
import { cn } from '../utils';

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'flex min-h-[80px] w-full rounded-md border border-[color:var(--panel-border-strong)] bg-[color:var(--panel)] px-3 py-2 text-sm text-[color:var(--ink)] placeholder:text-[color:var(--muted)] focus:border-[color:var(--accent)] focus:outline-none focus:ring-1 focus:ring-[color:var(--accent)] disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
