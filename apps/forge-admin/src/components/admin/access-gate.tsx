import { LoaderCircle } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function AccessGate(input: {
  initialValue: string;
  warningMessage?: string | null;
  submitting?: boolean;
  onSave(value: string): void | Promise<void>;
}) {
  const [value, setValue] = useState(input.initialValue);

  return (
    <div className="forja-app">
      <div className="flex min-h-screen items-center justify-center px-6 animate-in fade-in duration-300">
        <form
          className="flex w-full max-w-sm flex-col gap-3 transition-opacity duration-200"
          data-loading={input.submitting ? 'true' : 'false'}
          onSubmit={(event) => {
            event.preventDefault();
            input.onSave(value);
          }}
        >
          <div className="text-center text-5xl font-semibold tracking-[-0.07em] sm:text-6xl">Forja</div>
          <div className="text-center text-base text-muted-foreground">
            Informe sua chave de acesso.
          </div>
          <Input
            type="password"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Chave de acesso"
            className="h-11 rounded-md bg-background"
          />
          {input.warningMessage ? (
            <div className="text-sm text-destructive">{input.warningMessage}</div>
          ) : null}
          <div className="flex justify-end">
            <Button type="submit" className="h-12 gap-2 px-5" disabled={!value.trim() || input.submitting}>
              {input.submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
              {input.submitting ? 'Entrando...' : 'Entrar'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
