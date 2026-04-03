import type { ComponentProps } from 'react';

import { DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export function AdminDialogContent({ className, ...props }: ComponentProps<typeof DialogContent>) {
  return (
    <DialogContent
      className={cn(
        'rounded-lg [&_[data-slot=dialog-close]]:rounded-lg [&_[data-slot=dialog-close]]:bg-destructive/10 [&_[data-slot=dialog-close]]:text-destructive [&_[data-slot=dialog-close]]:hover:bg-destructive/20 [&_[data-slot=dialog-close]]:hover:text-destructive',
        className,
      )}
      {...props}
    />
  );
}

export function AdminDialogFooter({ className, ...props }: ComponentProps<typeof DialogFooter>) {
  return (
    <DialogFooter
      className={cn('flex-row justify-end gap-2 rounded-b-lg bg-muted/50 px-4 py-3', className)}
      {...props}
    />
  );
}

export function AdminDialogHeader({ className, ...props }: ComponentProps<typeof DialogHeader>) {
  return (
    <DialogHeader
      className={cn('-mx-4 -mt-4 items-center rounded-t-lg border-b bg-muted/60 px-4 py-4 text-center', className)}
      {...props}
    />
  );
}

export function AdminDialogTitle({ className, ...props }: ComponentProps<typeof DialogTitle>) {
  return <DialogTitle className={cn('text-xl', className)} {...props} />;
}
