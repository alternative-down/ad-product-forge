import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function AccessGate(input: {
  initialValue: string;
  onSave(value: string): void;
}) {
  const [value, setValue] = useState(input.initialValue);

  return (
    <div className="forge-admin-v2 min-h-screen bg-[color:var(--v2-bg)] text-[color:var(--v2-text)]">
      <div className="flex min-h-screen items-center justify-center px-6">
        <form
          className="flex w-full max-w-sm flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            input.onSave(value);
          }}
        >
          <Input
            type="password"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Access key"
            className="h-11 border-[color:var(--v2-border)] bg-white"
          />
          <Button type="submit" disabled={!value.trim()}>
            Enter
          </Button>
        </form>
      </div>
    </div>
  );
}
