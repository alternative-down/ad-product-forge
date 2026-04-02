import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export function AppShell(input: {
  sidebar: ReactNode;
  topbar?: ReactNode;
  children: ReactNode;
  detailPane?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('forge-admin-v2 v2-shell', input.className)}>
      <div className="grid min-h-screen grid-cols-[260px_minmax(0,1fr)]">
        <aside className="v2-sidebar flex min-h-screen flex-col">{input.sidebar}</aside>
        <div className="flex min-h-screen min-w-0 flex-col">
          {input.topbar ? (
            <header className="v2-topbar sticky top-0 z-10">{input.topbar}</header>
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
    </div>
  );
}
