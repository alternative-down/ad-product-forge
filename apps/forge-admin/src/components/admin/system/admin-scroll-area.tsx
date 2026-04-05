import type { ComponentProps, ReactNode } from 'react';

import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export function AdminScrollArea({
  className,
  contentClassName,
  children,
  ...props
}: ComponentProps<typeof ScrollArea> & {
  contentClassName?: string;
  children: ReactNode;
}) {
  return (
    <ScrollArea
      className={cn('min-h-0 overflow-hidden -mr-2 [&_[data-slot=scroll-area-scrollbar]]:border-l-0', className)}
      {...props}
    >
      <div className={cn('pr-3', contentClassName)}>
        {children}
      </div>
    </ScrollArea>
  );
}
