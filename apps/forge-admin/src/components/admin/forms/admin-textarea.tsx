import type { ComponentProps } from 'react';

import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export function AdminTextarea({ className, ...props }: ComponentProps<typeof Textarea>) {
  return (
    <Textarea
      className={cn('rounded-sm border-border/80 bg-background/80 shadow-none', className)}
      {...props}
    />
  );
}
