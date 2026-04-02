import type { ReactNode } from 'react';

export function EmptyState(input: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="v2-section-quiet flex min-h-48 flex-col items-start justify-center gap-3 p-6">
      <div className="text-base font-semibold tracking-[-0.02em]">{input.title}</div>
      {input.description ? <p className="v2-subtitle max-w-xl">{input.description}</p> : null}
      {input.action ? <div className="pt-1">{input.action}</div> : null}
    </div>
  );
}
