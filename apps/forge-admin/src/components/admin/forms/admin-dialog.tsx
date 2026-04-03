import type { ComponentProps } from 'react';

import { DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export function AdminDialogContent({ className, ...props }: ComponentProps<typeof DialogContent>) {
  return <DialogContent className={cn('rounded-lg', className)} {...props} />;
}

export function AdminDialogFooter({ className, ...props }: ComponentProps<typeof DialogFooter>) {
  return <DialogFooter className={cn('rounded-b-lg', className)} {...props} />;
}

export function AdminDialogHeader({ className, ...props }: ComponentProps<typeof DialogHeader>) {
  return (
    <DialogHeader
      className={cn('-mx-4 -mt-4 rounded-t-lg border-b bg-muted/50 px-4 py-4', className)}
      {...props}
    />
  );
}

export function AdminDialogTitle({ className, ...props }: ComponentProps<typeof DialogTitle>) {
  return <DialogTitle className={cn('text-lg', className)} {...props} />;
}
