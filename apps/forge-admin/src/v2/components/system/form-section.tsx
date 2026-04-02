import type { ReactNode } from 'react';

export function FormSection(input: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold tracking-[-0.01em]">{input.title}</h3>
        {input.description ? <p className="v2-subtitle max-w-2xl">{input.description}</p> : null}
      </div>
      <div className="space-y-4">{input.children}</div>
    </section>
  );
}
