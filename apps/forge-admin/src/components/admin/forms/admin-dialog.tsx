import type { ComponentProps } from 'react';
import { useLayoutEffect, useRef, useState } from 'react';


import { AdminButton } from '@/components/admin/forms/admin-button';
import { AdminScrollArea } from '@/components/admin/system/admin-scroll-area';
import { CloseIcon } from '@/components/ui/close-button';
import {
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
      className={cn(
        'shrink-0 flex-row justify-end gap-2 rounded-b-lg bg-muted/50 px-4 py-3',
        className,
      )}
      {...props}
    />
  );
}

export function AdminDialogHeader({
  className,
  children,
  ...props
}: ComponentProps<typeof DialogHeader>) {
  return (
    <DialogHeader
      className={cn(
        'relative -mx-4 -mt-4 shrink-0 items-center rounded-t-lg border-b bg-muted/60 px-4 py-4 text-center',
        className,
      )}
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
        <CloseIcon label="Fechar" />
      </DialogClose>
    </DialogHeader>
  );
}

export function AdminDialogTitle({ className, ...props }: ComponentProps<typeof DialogTitle>) {
  return <DialogTitle className={cn('text-xl', className)} {...props} />;
}

/**
 * AdminDialogBody intentionally uses raw ComponentProps<'div'> rather
 * than a Dialog primitive because the body height calculation
 * requires DOM-level ResizeObserver access. If a DialogBody primitive
 * is added in the future, this can be migrated (L#NN-50 #34 follow-up).
 *
 * Related: #6157 type-asymmetry documentation.
 */
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

      // L#NN-50 #34 — named alias for the magic 11/2 in #6156
      // Sum of AdminDialogHeader + AdminDialogFooter vertical chrome
      // (px-4 padding + content + py-3 padding + py-4 padding + content + py-4 padding).
      // Update when AdminDialogHeader/Footer padding or margin changes.
      const HEADER_FOOTER_CHROME_REM = 11;
      // Padding buffer (2rem) below content inside AdminScrollArea.
      const PADDING_REM = 2;

      const rootFontSize =
        Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;
      const viewportHeight = window.innerHeight;
      const maxBodyHeight = window.matchMedia('(min-width: 640px)').matches
        ? viewportHeight * 0.8 - rootFontSize * HEADER_FOOTER_CHROME_REM
        : viewportHeight - rootFontSize * HEADER_FOOTER_CHROME_REM;
      const nextHeight = Math.min(
        contentRef.current.scrollHeight + rootFontSize * PADDING_REM,
        maxBodyHeight,
      );

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
