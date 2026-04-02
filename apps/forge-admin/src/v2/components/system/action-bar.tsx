import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export function ActionBar(input: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', input.className)}>{input.children}</div>
  );
}
