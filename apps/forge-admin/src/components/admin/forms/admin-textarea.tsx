import type { ComponentProps } from 'react';

import { Textarea } from '@/components/ui/textarea';

export function AdminTextarea(props: ComponentProps<typeof Textarea>) {
  return <Textarea {...props} />;
}
