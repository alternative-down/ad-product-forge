import type { HTMLAttributes } from 'react';

import { cn } from '../../lib/utils';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-md border border-[color:var(--panel-border)] bg-[color:var(--panel)] shadow-[0_10px_30px_rgba(15,23,42,0.04)] backdrop-blur',
        className,
      )}
      {...props}
    />
  );
}
