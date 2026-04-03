import type { ComponentProps } from 'react';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export function AdminInput({ className, ...props }: ComponentProps<typeof Input>) {
  return <Input className={cn('h-10 rounded-sm border-border/80 bg-background/80 shadow-none', className)} {...props} />;
}
