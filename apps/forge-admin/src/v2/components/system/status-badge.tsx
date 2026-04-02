import { cva } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeStyles = cva(
  'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium tracking-[0.01em]',
  {
    variants: {
      tone: {
        neutral: 'bg-white text-[color:var(--v2-text)] ring-1 ring-[color:var(--v2-border)]',
        accent: 'bg-[color:var(--v2-accent-soft)] text-[color:var(--v2-accent)] ring-1 ring-[color:var(--v2-accent-soft)]',
        success: 'bg-[color:color-mix(in_srgb,var(--v2-success)_12%,white)] text-[color:var(--v2-success)] ring-1 ring-[color:color-mix(in_srgb,var(--v2-success)_18%,white)]',
        warning: 'bg-[color:color-mix(in_srgb,var(--v2-warning)_12%,white)] text-[color:var(--v2-warning)] ring-1 ring-[color:color-mix(in_srgb,var(--v2-warning)_18%,white)]',
        danger: 'bg-[color:color-mix(in_srgb,var(--v2-danger)_12%,white)] text-[color:var(--v2-danger)] ring-1 ring-[color:color-mix(in_srgb,var(--v2-danger)_18%,white)]',
      },
    },
    defaultVariants: {
      tone: 'neutral',
    },
  },
);

export function StatusBadge(input: {
  children: string;
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
  className?: string;
}) {
  return <span className={cn(badgeStyles({ tone: input.tone }), input.className)}>{input.children}</span>;
}
