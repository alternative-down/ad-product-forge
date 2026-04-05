import type { ComponentProps } from 'react';

import { XIcon } from 'lucide-react';

import { AdminButton } from '@/components/admin/forms/admin-button';
import { AdminScrollArea } from '@/components/admin/system/admin-scroll-area';
import { DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export function AdminDialogContent({ className, ...props }: ComponentProps<typeof DialogContent>) {
  return (
    <DialogContent
      className={cn(
        'flex h-[calc(100dvh-2rem)] max-h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-lg sm:h-[80dvh] sm:max-h-[80dvh]',
        className,
      )}
      showCloseButton={false}
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

export function AdminDialogHeader({ className, children, ...props }: ComponentProps<typeof DialogHeader>) {
  return (
    <DialogHeader
      className={cn('relative -mx-4 -mt-4 items-center rounded-t-lg border-b bg-muted/60 px-4 py-4 text-center', className)}
      {...props}
    >
      {children}
      <DialogClose
        render={
          <AdminButton
            variant="ghost"
            size="icon-sm"
            className="absolute top-4 right-4 rounded-full bg-destructive/20 text-foreground hover:bg-destructive/30 hover:text-foreground"
          />
        }
      >
        <XIcon />
        <span className="sr-only">Fechar</span>
      </DialogClose>
    </DialogHeader>
  );
}

export function AdminDialogTitle({ className, ...props }: ComponentProps<typeof DialogTitle>) {
  return <DialogTitle className={cn('text-xl', className)} {...props} />;
}

export function AdminDialogBody({ className, children, ...props }: ComponentProps<'div'>) {
  return (
    <div className="min-h-0 flex-1">
      <AdminScrollArea className="h-full" contentClassName={cn('space-y-4 py-4 pl-px pr-4', className)}>
        <div {...props}>
          {children}
        </div>
      </AdminScrollArea>
    </div>
  );
}
