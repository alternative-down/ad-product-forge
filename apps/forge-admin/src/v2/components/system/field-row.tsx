import type { ReactNode } from 'react';

export function FieldRow(input: {
  label: string;
  hint?: string;
  control: ReactNode;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)] md:items-start">
      <div className="pt-2">
        <div className="text-sm font-medium">{input.label}</div>
        {input.hint ? <div className="v2-subtitle mt-1">{input.hint}</div> : null}
      </div>
      <div>{input.control}</div>
    </div>
  );
}
