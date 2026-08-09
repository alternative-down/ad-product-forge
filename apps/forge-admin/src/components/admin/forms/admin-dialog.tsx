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

// L#NN-50 #34 + #6156 — named constants for the magic 11/2 chrome calculations.
// Sum of AdminDialogHeader (py-4 + content + py-4) + AdminDialogFooter (px-4 + content + py-3)
// plus the AdminScrollArea pb-4 padding buffer. Update when AdminDialogHeader/Footer/AdminScrollArea
// padding or margin changes — otherwise AdminDialogBody max-height will silently miscalculate.
const HEADER_FOOTER_CHROME_REM = 11;
const PADDING_BUFFER_REM = 2;
// Wide-screen breakpoint matches Tailwind's `sm:` default (640px). Below this threshold the
// dialog uses full viewport height instead of 80% (see `isWide` derivation in AdminDialogBody).
const WIDE_SCREEN_MIN_WIDTH_PX = 640;

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
 * AdminDialogBody intentionally uses raw ComponentProps<'div'> rather than a Dialog primitive.
 *
 * The body height calculation requires direct DOM access via ResizeObserver + window.innerHeight
 * to dynamically compute maxBodyHeight. A future DialogBody primitive in @/components/ui/dialog
 * would need to expose a `ref` typed as HTMLDivElement (or richer) for this ResizeObserver
 * pattern to work — at that point AdminDialogBody can be migrated to ComponentProps<typeof DialogBody>.
 *
 * Type asymmetry vs the other 4 AdminDialog* siblings (Content/Footer/Header/Title all typed via
 * `ComponentProps<typeof DialogX>`) is therefore INTENTIONAL, not accidental. Tracking: #6157.
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

      const rootFontSize =
        Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;
      const viewportHeight = window.innerHeight;
      const chromeHeight = rootFontSize * HEADER_FOOTER_CHROME_REM;
      const paddingHeight = rootFontSize * PADDING_BUFFER_REM;
      const isWide = window.matchMedia(`(min-width: ${WIDE_SCREEN_MIN_WIDTH_PX}px)`).matches;

      const maxBodyHeight = (isWide ? viewportHeight * 0.8 : viewportHeight) - chromeHeight;
      const nextHeight = Math.min(
        contentRef.current.scrollHeight + paddingHeight,
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
