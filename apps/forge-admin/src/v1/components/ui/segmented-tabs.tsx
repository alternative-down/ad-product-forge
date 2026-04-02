import { Button } from './button';
import { cn } from '../../lib/utils';

export function SegmentedTabs<TTab extends string>(input: {
  value: TTab;
  items: Array<{
    value: TTab;
    label: string;
    description?: string;
  }>;
  onChange(value: TTab): void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap gap-2 rounded-lg border border-[color:var(--panel-border)] bg-[color:var(--panel)] p-2',
        input.className,
      )}
    >
      {input.items.map((item) => (
        <Button
          key={item.value}
          type="button"
          variant={input.value === item.value ? 'primary' : 'ghost'}
          className={cn(
            'h-auto min-w-[170px] flex-1 items-start justify-start px-4 py-3 text-left',
            input.value !== item.value && 'bg-transparent',
          )}
          onClick={() => input.onChange(item.value)}
        >
          <span className="flex flex-col gap-1">
            <span>{item.label}</span>
            {item.description ? (
              <span
                className={cn(
                  'text-xs font-medium normal-case',
                  input.value === item.value ? 'text-white/70' : 'text-[color:var(--muted)]',
                )}
              >
                {item.description}
              </span>
            ) : null}
          </span>
        </Button>
      ))}
    </div>
  );
}
