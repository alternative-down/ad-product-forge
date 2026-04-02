import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function AccessGate(input: {
  initialValue: string;
  onSave(value: string): void;
  onClear(): void;
}) {
  const [value, setValue] = useState(input.initialValue);
  const hasStoredKey = input.initialValue.trim().length > 0;

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
          <div className="text-center text-4xl font-semibold tracking-[-0.06em]">Forge</div>
          <div className="text-center text-sm text-[color:var(--v2-muted)]">
            Informe sua chave de acesso.
          </div>
          {hasStoredKey ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setValue('');
                input.onClear();
              }}
            >
              Esquecer
            </Button>
          ) : (
            <>
              <Input
                type="password"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder="Chave de acesso"
              className="h-11 rounded-lg border-[color:var(--v2-border)] bg-white"
              />
              <Button type="submit" disabled={!value.trim()}>
                Entrar
              </Button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
