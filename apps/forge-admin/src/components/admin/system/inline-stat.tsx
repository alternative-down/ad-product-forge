export function InlineStat(input: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="v2-section-quiet flex min-w-0 flex-col gap-1.5 p-4">
      <div className="v2-label">{input.label}</div>
      <div className="text-xl font-semibold tracking-[-0.03em]">{input.value}</div>
      {input.detail ? <div className="v2-subtitle">{input.detail}</div> : null}
    </div>
  );
}
