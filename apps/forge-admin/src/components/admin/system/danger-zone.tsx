import type { ReactNode } from 'react';

export function DangerZone(input: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[color:color-mix(in_srgb,var(--v2-danger)_28%,white)] bg-[color:color-mix(in_srgb,var(--v2-danger)_6%,white)] p-5 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="text-base font-semibold tracking-[-0.02em] text-[color:var(--v2-danger)]">
            {input.title}
          </div>
          {input.description ? <p className="mt-2 text-sm leading-6 text-[color:var(--v2-muted)]">{input.description}</p> : null}
        </div>
        {input.actions ? <div className="flex items-center gap-2">{input.actions}</div> : null}
      </div>
    </section>
  );
}
