import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export function TopBar(input: {
  title?: string;
  eyebrow?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-h-16 items-center justify-between gap-4 px-6 py-3', input.className)}>
      <div className="min-w-0">
        {input.eyebrow ? <div className="v2-label">{input.eyebrow}</div> : null}
        {input.title ? <div className="truncate text-sm font-medium">{input.title}</div> : null}
      </div>
      {input.actions ? <div className="flex items-center gap-2">{input.actions}</div> : null}
    </div>
  );
}
