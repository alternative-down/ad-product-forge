import type { ButtonHTMLAttributes } from 'react';

import { cn } from '../../lib/utils';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
};

export function Button({ className, variant = 'primary', ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex h-11 items-center justify-center rounded-md border px-5 text-sm font-semibold transition duration-150 disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' &&
          'border-[color:var(--bg-deep)] bg-[color:var(--bg-deep)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] hover:bg-slate-800',
        variant === 'secondary' &&
          'border-[color:var(--panel-border-strong)] bg-[color:var(--panel-strong)] text-[color:var(--ink)] hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]',
        variant === 'ghost' &&
          'border-transparent bg-transparent text-[color:var(--muted-strong)] hover:bg-[color:var(--panel-muted)] hover:text-[color:var(--ink)]',
        variant === 'danger' &&
          'border-red-300 bg-red-50 text-red-700 hover:border-red-400 hover:bg-red-100',
        className,
      )}
      {...props}
    />
  );
}
