import type { ReactNode, SelectHTMLAttributes, ChangeEvent } from 'react';

import { cn } from '../../lib/utils';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  options?: SelectOption[];
  onChange?: (value: string) => void;
  children?: ReactNode;
}

export function Select({ className, options, onChange, children, ...props }: SelectProps) {
  const handleChange = (e: ChangeEvent<HTMLSelectElement>) => {
    onChange?.(e.target.value);
  };

  return (
    <select
      className={cn(
        'h-11 w-full rounded-lg border border-[color:var(--panel-border-strong)] bg-[color:var(--panel-strong)] px-4 text-sm text-[color:var(--ink)] outline-none transition focus:border-[color:var(--accent)] focus:ring-4 focus:ring-[color:var(--accent-soft)]',
        className,
      )}
      onChange={handleChange}
      {...props}
    >
      {options && options.length > 0 ? (
        options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))
      ) : (
        children
      )}
    </select>
  );
}
