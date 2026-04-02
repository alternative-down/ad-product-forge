import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function AccessGate(input: {
  initialValue: string;
  onSave(value: string): void;
  onForget(): void;
}) {
  const [value, setValue] = useState(input.initialValue);
  const hasStoredKey = input.initialValue.trim().length > 0;

  return (
    <div className="forja-app">
      <div className="flex min-h-screen items-center justify-center px-6">
        <form
          className="flex w-full max-w-sm flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            input.onSave(value);
          }}
        >
          <div className="text-center text-4xl font-semibold tracking-[-0.06em]">Forja</div>
          <div className="text-center text-sm text-muted-foreground">
            Informe sua chave de acesso.
          </div>
          <Input
            type="password"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Chave de acesso"
            className="h-11 rounded-md bg-background"
          />
          <div className="flex justify-end">
            {hasStoredKey ? (
              <Button
                type="button"
                variant="outline"
                className="h-12 px-5"
                onClick={() => {
                  setValue('');
                  input.onForget();
                }}
              >
                Esquecer
              </Button>
            ) : (
              <Button type="submit" className="h-12 px-5" disabled={!value.trim()}>
                Entrar
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
