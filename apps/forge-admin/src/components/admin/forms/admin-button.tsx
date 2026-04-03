import type { ComponentProps } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function AdminButton({ className, ...props }: ComponentProps<typeof Button>) {
  return <Button className={cn('h-10 rounded-sm px-4', className)} {...props} />;
}
