import type { ComponentProps } from 'react';
import { useLayoutEffect, useRef, useState } from 'react';

import { XIcon } from 'lucide-react';

import { AdminButton } from '@/components/admin/forms/admin-button';
import { AdminScrollArea } from '@/components/admin/system/admin-scroll-area';
import { DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export function AdminDialogContent({ className, ...props }: ComponentProps<typeof DialogContent>) {
  return (
    <DialogContent
      className={cn(
        'flex w-[calc(100dvw-2rem)] max-h-[calc(100dvh-2rem)] max-w-[calc(100dvw-2rem)] flex-col overflow-hidden rounded-lg sm:max-h-[80dvh] sm:max-w-[60vw] [&>form]:min-h-0 [&>form]:flex [&>form]:flex-1 [&>form]:flex-col',
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
      className={cn('shrink-0 flex-row justify-end gap-2 rounded-b-lg bg-muted/50 px-4 py-3', className)}
      {...props}
    />
  );
}

export function AdminDialogHeader({ className, children, ...props }: ComponentProps<typeof DialogHeader>) {
  return (
    <DialogHeader
      className={cn('relative -mx-4 -mt-4 shrink-0 items-center rounded-t-lg border-b bg-muted/60 px-4 py-4 text-center', className)}
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
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [bodyHeight, setBodyHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (typeof window === 'undefined' || !contentRef.current) {
      return;
    }

    const updateHeight = () => {
      if (!contentRef.current) {
        return;
      }

      const rootFontSize = Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;
      const viewportHeight = window.innerHeight;
      const maxBodyHeight = window.matchMedia('(min-width: 640px)').matches
        ? viewportHeight * 0.8 - rootFontSize * 11
        : viewportHeight - rootFontSize * 11;
      const nextHeight = Math.min(contentRef.current.scrollHeight + rootFontSize * 2, maxBodyHeight);

      setBodyHeight(Math.max(nextHeight, 0));
    };

    updateHeight();

    const resizeObserver = new ResizeObserver(() => {
      updateHeight();
    });

    resizeObserver.observe(contentRef.current);
    window.addEventListener('resize', updateHeight);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateHeight);
    };
  }, [children]);

  return (
    <AdminScrollArea
      className="overflow-hidden"
      contentClassName={cn('space-y-4 pb-4 pl-px pr-4', className)}
      style={bodyHeight ? { height: `${bodyHeight}px` } : undefined}
    >
      <div ref={contentRef} {...props}>
        {children}
      </div>
    </AdminScrollArea>
  );
}
