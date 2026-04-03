import type { ComponentProps } from 'react';

import { Button } from '@/components/ui/button';

export function AdminButton(props: ComponentProps<typeof Button>) {
  return <Button {...props} />;
}
