import type { ComponentProps } from 'react';

import { XIcon } from 'lucide-react';

import { AdminButton } from '@/components/admin/forms/admin-button';
import { DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export function AdminDialogContent({ className, ...props }: ComponentProps<typeof DialogContent>) {
  return (
    <DialogContent
      className={cn(
        'max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-lg',
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
