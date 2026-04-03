import { LoaderCircle } from 'lucide-react';
import { useState } from 'react';

import { AdminButton, AdminInput } from '@/components/admin';
import { ThemeToggleButton } from '@/components/admin/theme-toggle-button';

export function AccessGate(input: {
  initialValue: string;
  warningMessage?: string | null;
  submitting?: boolean;
  theme: 'light' | 'dark';
  onThemeToggle(): void;
  onSave(value: string): void | Promise<void>;
}) {
  const [value, setValue] = useState(input.initialValue);

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-6 text-foreground animate-in fade-in duration-300">
      <div className="absolute right-6 top-6">
        <ThemeToggleButton theme={input.theme} onToggle={input.onThemeToggle} />
      </div>
      <form
        className={input.submitting
          ? 'flex w-full max-w-sm flex-col gap-3 transition-opacity duration-200 opacity-72'
          : 'flex w-full max-w-sm flex-col gap-3 transition-opacity duration-200'}
        onSubmit={(event) => {
          event.preventDefault();
          input.onSave(value);
        }}
      >
        <div className="text-center text-5xl font-semibold tracking-[-0.07em] sm:text-6xl">Forja</div>
        <div className="text-center text-base text-muted-foreground">
          Informe sua chave de acesso.
        </div>
        <AdminInput
          type="password"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Chave de acesso"
        />
        {input.warningMessage ? (
          <div className="text-sm text-destructive">{input.warningMessage}</div>
        ) : null}
        <div className="flex justify-end">
          <AdminButton type="submit" className="gap-2" disabled={!value.trim() || input.submitting}>
            {input.submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            {input.submitting ? 'Entrando...' : 'Entrar'}
          </AdminButton>
        </div>
      </form>
    </div>
  );
}
