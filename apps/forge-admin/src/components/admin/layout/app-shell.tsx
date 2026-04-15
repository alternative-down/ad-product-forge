import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export function AppShell(input: {
  topbar?: ReactNode;
  children: ReactNode;
  detailPane?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('h-screen overflow-hidden bg-background text-foreground', input.className)}>
      <div className="flex h-full min-w-0 flex-col overflow-hidden">
        {input.topbar ? (
          <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
            {input.topbar}
          </header>
        ) : null}
        <div
          className={cn(
            'grid min-h-0 flex-1 overflow-hidden gap-4 p-4 md:gap-5 md:p-5',
            input.detailPane ? 'xl:grid-cols-[minmax(0,1fr)_340px]' : '',
          )}
        >
          <main className="flex min-h-0 min-w-0 flex-col">{input.children}</main>
          {input.detailPane ? <aside className="min-h-0 min-w-0">{input.detailPane}</aside> : null}
        </div>
      </div>
    </div>
  );
}
