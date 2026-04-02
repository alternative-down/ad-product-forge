import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export function SidebarNav(input: {
  brand: string;
  label?: string;
  items: Array<{
    to: string;
    label: string;
    detail?: string;
    icon?: ReactNode;
    active?: boolean;
  }>;
  footer?: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col px-4 py-5">
      <div className="px-3 pb-6">
        {input.label ? (
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            {input.label}
          </div>
        ) : null}
        <div className="mt-1 text-lg font-semibold tracking-[-0.02em]">{input.brand}</div>
      </div>
      <nav className="flex flex-1 flex-col gap-1.5">
        {input.items.map((item) => (
          <Link
            key={`${item.to}:${item.label}`}
            to={item.to}
            className={cn(
              'flex items-start gap-3 rounded-lg px-3 py-3 text-sm text-foreground transition-colors hover:bg-background',
            )}
            data-active={item.active ? 'true' : 'false'}
          >
            {item.icon ? <span className="mt-0.5 text-muted-foreground">{item.icon}</span> : null}
            <span className="min-w-0">
              <span className="block font-medium">{item.label}</span>
              {item.detail ? (
                <span className="mt-0.5 block text-xs text-muted-foreground">{item.detail}</span>
              ) : null}
            </span>
          </Link>
        ))}
      </nav>
      {input.footer ? <div className="pt-4">{input.footer}</div> : null}
    </div>
  );
}
