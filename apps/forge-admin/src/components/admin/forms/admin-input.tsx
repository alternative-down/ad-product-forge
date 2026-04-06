import type { ComponentProps } from 'react';

import { Input } from '@/components/ui/input';

export function AdminInput(props: ComponentProps<typeof Input>) {
  return <Input {...props} />;
}
