import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export function DetailPane(input: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <aside className={cn('v2-section h-full p-5 md:p-6', input.className)}>
      {input.title || input.subtitle ? (
        <div className="mb-5">
          {input.title ? <div className="text-base font-semibold tracking-[-0.02em]">{input.title}</div> : null}
          {input.subtitle ? <div className="v2-subtitle mt-2">{input.subtitle}</div> : null}
        </div>
      ) : null}
      {input.children}
    </aside>
  );
}
