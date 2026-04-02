import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export function Toolbar(input: {
  leading?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('v2-section-quiet flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between', input.className)}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">{input.leading}</div>
      <div className="flex flex-wrap items-center gap-2">{input.trailing}</div>
    </div>
  );
}
