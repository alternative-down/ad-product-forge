import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export function AppShell(input: {
  topbar?: ReactNode;
  children: ReactNode;
  detailPane?: ReactNode;
  className?: string;
  theme?: 'light' | 'dark';
}) {
  return (
    <div
      className={cn('forja-app min-h-screen bg-background text-foreground', input.className)}
      data-theme={input.theme}
    >
      <div className="flex min-h-screen min-w-0 flex-col">
        {input.topbar ? (
          <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
            {input.topbar}
          </header>
        ) : null}
        <div
          className={cn(
            'grid min-h-0 flex-1 gap-6 p-6',
            input.detailPane ? 'xl:grid-cols-[minmax(0,1fr)_340px]' : '',
          )}
        >
          <main className="min-w-0">{input.children}</main>
          {input.detailPane ? <aside className="min-w-0">{input.detailPane}</aside> : null}
        </div>
      </div>
    </div>
  );
}
