import type { ComponentProps } from 'react';

import { DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { getStoredAdminTheme } from '@/lib/admin-secret';
import { cn } from '@/lib/utils';

export function AdminDialogContent({ className, ...props }: ComponentProps<typeof DialogContent>) {
  return (
    <DialogContent
      data-theme={getStoredAdminTheme()}
      className={cn(
        'forja-theme max-w-[calc(100vw-2rem)] border-border/70 bg-background/95 shadow-xl shadow-black/5 sm:max-w-2xl',
        className,
      )}
      {...props}
    />
  );
}

export function AdminDialogFooter({ className, ...props }: ComponentProps<typeof DialogFooter>) {
  return <DialogFooter className={cn('mx-0 mb-0 rounded-none border-border/70 bg-transparent p-0 pt-3', className)} {...props} />;
}

export function AdminDialogHeader({ className, ...props }: ComponentProps<typeof DialogHeader>) {
  return <DialogHeader className={cn('gap-1 border-b border-border/70 pb-3', className)} {...props} />;
}
