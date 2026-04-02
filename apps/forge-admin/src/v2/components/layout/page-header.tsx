import type { ReactNode } from 'react';

export function PageHeader(input: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 pb-2 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {input.eyebrow ? <div className="v2-label">{input.eyebrow}</div> : null}
        <h1 className="v2-title mt-1">{input.title}</h1>
        {input.description ? <p className="v2-subtitle mt-3 max-w-3xl">{input.description}</p> : null}
      </div>
      {input.actions ? <div className="flex items-center gap-2">{input.actions}</div> : null}
    </div>
  );
}
