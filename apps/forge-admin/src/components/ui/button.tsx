import type { ButtonHTMLAttributes } from 'react';

import { cn } from '../../lib/utils';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
};

export function Button({ className, variant = 'primary', ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex h-10 items-center justify-center rounded-lg border px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' && 'border-slate-950 bg-slate-950 text-white hover:bg-slate-800',
        variant === 'secondary' && 'border-slate-300 bg-white text-slate-900 hover:bg-slate-100',
        variant === 'ghost' && 'border-transparent bg-transparent text-slate-700 hover:bg-slate-100',
        variant === 'danger' && 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100',
        className,
      )}
      {...props}
    />
  );
}
