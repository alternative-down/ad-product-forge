import type { ReactNode } from 'react';

import { XIcon } from 'lucide-react';

/**
 * L#NN-50 #34 extraction — DRY the close-button icon pattern (#6159).
 *
 * Shared by DialogContent (ui/dialog.tsx), SheetContent (ui/sheet.tsx),
 * and AdminDialogHeader (admin/forms/admin-dialog.tsx). The wrapping
 * Button or AdminButton is intentionally kept site-specific to preserve
 * positioning classes (top-2/right-2 vs top-3/right-3 vs top-4/right-4)
 * and variant overrides.
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
