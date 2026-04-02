import type { ReactNode } from 'react';

export function TimelineList(input: {
  items: Array<{
    key: string;
    title: ReactNode;
    description?: ReactNode;
    meta?: ReactNode;
  }>;
}) {
  return (
    <div className="space-y-0">
      {input.items.map((item, index) => (
        <div
          key={item.key}
          className={index === 0 ? 'grid gap-2 py-0 md:grid-cols-[140px_minmax(0,1fr)]' : 'grid gap-2 border-t border-[color:var(--v2-border)] py-4 md:grid-cols-[140px_minmax(0,1fr)]'}
        >
          <div className="v2-mono text-xs text-[color:var(--v2-muted)]">{item.meta}</div>
          <div className="min-w-0">
            <div className="text-sm font-medium">{item.title}</div>
            {item.description ? (
              <div className="v2-subtitle mt-1 whitespace-pre-wrap">{item.description}</div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
