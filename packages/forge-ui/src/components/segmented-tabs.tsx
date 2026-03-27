import { cn } from '../utils';

type SegmentedTabsProps = {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  className?: string;
};

export function SegmentedTabs({ value, onChange, options, className }: SegmentedTabsProps) {
  return (
    <div
      className={cn(
        'inline-flex h-11 items-center justify-center rounded-md border border-[color:var(--panel-border-strong)] bg-[color:var(--panel-muted)] p-1',
        className,
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all',
            value === option.value
              ? 'bg-[color:var(--panel)] text-[color:var(--ink)] shadow-sm'
              : 'text-[color:var(--muted)] hover:text-[color:var(--ink)]',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
