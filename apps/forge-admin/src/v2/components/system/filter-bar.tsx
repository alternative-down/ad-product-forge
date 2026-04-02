import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export function FilterBar(input: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'v2-section-quiet flex flex-wrap items-center gap-2 p-3 md:p-4',
        input.className,
      )}
    >
      {input.children}
    </div>
  );
}
