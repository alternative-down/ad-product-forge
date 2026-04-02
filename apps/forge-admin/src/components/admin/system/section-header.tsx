import type { ReactNode } from 'react';

export function SectionHeader(input: {
  kicker?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0">
        {input.kicker ? <div className="v2-kicker">{input.kicker}</div> : null}
        <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em]">{input.title}</h2>
        {input.description ? <p className="v2-subtitle mt-2 max-w-2xl">{input.description}</p> : null}
      </div>
      {input.actions ? <div className="flex items-center gap-2">{input.actions}</div> : null}
    </div>
  );
}
