import type { ComponentProps } from 'react';

import { DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export function AdminDialogContent({ className, ...props }: ComponentProps<typeof DialogContent>) {
  return <DialogContent className={cn('max-w-[calc(100vw-2rem)] sm:max-w-2xl', className)} {...props} />;
}

export function AdminDialogFooter({ className, ...props }: ComponentProps<typeof DialogFooter>) {
  return <DialogFooter className={cn('mx-0 mb-0 rounded-none border-border/70 bg-transparent p-0 pt-3', className)} {...props} />;
}

export function AdminDialogHeader({ className, ...props }: ComponentProps<typeof DialogHeader>) {
  return (
    <DialogHeader
      className={cn(
        '-mx-4 -mt-4 items-center gap-1 border-b border-border/70 bg-muted/35 px-4 py-3 text-center sm:-mx-5 sm:-mt-5 sm:px-5 sm:py-4',
        className,
      )}
      {...props}
    />
  );
}

export function AdminDialogTitle({ className, ...props }: ComponentProps<typeof DialogTitle>) {
  return <DialogTitle className={cn('text-lg font-semibold tracking-[-0.03em]', className)} {...props} />;
}
