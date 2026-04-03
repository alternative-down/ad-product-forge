import type { ComponentProps } from 'react';

import { DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function AdminDialogContent(props: ComponentProps<typeof DialogContent>) {
  return <DialogContent {...props} />;
}

export function AdminDialogFooter(props: ComponentProps<typeof DialogFooter>) {
  return <DialogFooter {...props} />;
}

export function AdminDialogHeader(props: ComponentProps<typeof DialogHeader>) {
  return <DialogHeader {...props} />;
}

export function AdminDialogTitle(props: ComponentProps<typeof DialogTitle>) {
  return <DialogTitle {...props} />;
}
