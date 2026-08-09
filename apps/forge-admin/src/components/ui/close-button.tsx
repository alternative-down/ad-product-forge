import type { ReactNode } from 'react';

import { XIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * L#NN-50 #34 extraction — DRY the close-button icon pattern (#6159).
 *
 * Shared by DialogContent (ui/dialog.tsx) and SheetContent (ui/sheet.tsx)
 * via `<XPrimitive.Close render={<CloseButton position="top-X right-X" />}>`
 * because both sites render the same Button variant="ghost" + size="icon-sm"
 * + absolute-positioned + CloseIcon composition.
 *
 * The AdminDialogHeader (admin/forms/admin-dialog.tsx) site uses AdminButton
 * (different wrapper) so it stays inline — see admin-dialog.tsx for the
 * AdminButton-specific render pattern.
 *
 * The text-only close (DialogFooter L98, which renders "Close" as a
 * label rather than an icon) is NOT covered here — it is a distinct
 * pattern and stays inline.
 */
export function CloseIcon({ label = 'Close' }: { label?: ReactNode }) {
  return (
    <>
      <XIcon />
      <span className="sr-only">{label}</span>
    </>
  );
}

/**
 * CloseButton — Button (variant="ghost", size="icon-sm") wrapped around a
 * CloseIcon, intended for use as the `render` prop of a DialogPrimitive.Close
 * or SheetPrimitive.Close. Position is the absolute-positioning tailwind
 * pair (e.g. "top-2 right-2" or "top-3 right-3"). Extra classes can be
 * passed via `className` and are appended to the base.
 *
 * Extracted per #6159 — replaces inline render={<Button variant="ghost"
 * className="absolute top-N right-N" size="icon-sm" />} patterns.
 */
export function CloseButton({
  position,
  className,
  label,
}: {
  position: string;
  className?: string;
  label?: ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className={cn('absolute', position, className)}
    >
      <CloseIcon label={label} />
    </Button>
  );
}