import type { ReactNode } from 'react';

export function KeyValueList(input: {
  items: Array<{
    key: string;
    label: string;
    value: ReactNode;
    mono?: boolean;
  }>;
}) {
  return (
    <dl className="divide-y divide-[color:var(--v2-border)]">
      {input.items.map((item) => (
        <div key={item.key} className="grid gap-1 py-3 md:grid-cols-[160px_minmax(0,1fr)] md:gap-4">
          <dt className="text-sm font-medium text-[color:var(--v2-muted)]">{item.label}</dt>
          <dd className={item.mono ? 'v2-mono text-sm text-[color:var(--v2-text)]' : 'text-sm text-[color:var(--v2-text)]'}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
