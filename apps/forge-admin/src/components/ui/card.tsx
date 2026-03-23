import type { HTMLAttributes } from 'react';

import { cn } from '../../lib/utils';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-[1.75rem] border border-[color:var(--panel-border)] bg-[color:var(--panel)] shadow-[0_20px_80px_rgba(15,23,42,0.08)] backdrop-blur',
        className,
      )}
      {...props}
    />
  );
}
