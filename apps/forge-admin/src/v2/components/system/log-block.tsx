import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export function LogBlock(input: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('v2-section overflow-hidden', input.className)}>
      {input.title ? (
        <div className="border-b border-[color:var(--v2-border)] px-4 py-3 text-sm font-medium">
          {input.title}
        </div>
      ) : null}
      <pre className="v2-mono overflow-x-auto whitespace-pre-wrap px-4 py-4 text-[12px] leading-6 text-[color:var(--v2-text)]">
        {input.children}
      </pre>
    </div>
  );
}
