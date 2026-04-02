import { KeyRound, Moon, Sparkles, Sun } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function AccessGate(input: {
  initialValue: string;
  errorMessage: string | null;
  theme: 'light' | 'dark';
  onThemeToggle(): void;
  onSave(value: string): void;
  onClear(): void;
}) {
  const [value, setValue] = useState(input.initialValue);

  return (
    <div className="forge-admin-v2 min-h-screen bg-[color:var(--v2-bg)] text-[color:var(--v2-text)]">
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(62,106,225,0.12),transparent_28%),radial-gradient(circle_at_82%_0%,rgba(255,205,212,0.28),transparent_20%),linear-gradient(180deg,#fbfaf6_0%,#f3efe7_100%)] px-5 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl flex-col justify-between gap-10 lg:grid lg:grid-cols-[1.1fr_0.9fr] lg:gap-12">
          <section className="flex flex-col justify-between gap-10 rounded-[32px] border border-white/70 bg-white/58 p-6 shadow-[0_18px_60px_rgba(31,31,27,0.08)] backdrop-blur md:p-8 lg:p-10">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="v2-kicker">Forge Admin</div>
                <h1 className="mt-3 max-w-xl text-4xl font-semibold tracking-[-0.06em] text-[color:var(--v2-text)] md:text-5xl">
                  Enter the secret and step into the system.
                </h1>
              </div>
              <Button
                type="button"
                variant="ghost"
                className="h-10 rounded-full border border-[color:var(--v2-border)] bg-white/70 px-3 text-[color:var(--v2-text)] hover:bg-white"
                onClick={input.onThemeToggle}
              >
                {input.theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-3xl border border-white/70 bg-[rgba(255,255,255,0.55)] p-4">
                <div className="v2-label">Use</div>
                <div className="mt-2 text-sm leading-6 text-[color:var(--v2-text)]">
                  Paste the admin secret to unlock this browser session.
                </div>
              </div>
              <div className="rounded-3xl border border-white/70 bg-[rgba(255,255,255,0.55)] p-4">
                <div className="v2-label">Storage</div>
                <div className="mt-2 text-sm leading-6 text-[color:var(--v2-text)]">
                  The secret stays only in local storage on this device.
                </div>
              </div>
              <div className="rounded-3xl border border-white/70 bg-[rgba(255,255,255,0.55)] p-4">
                <div className="v2-label">Access</div>
                <div className="mt-2 text-sm leading-6 text-[color:var(--v2-text)]">
                  If the backend rejects it, the gate opens again.
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 text-sm text-[color:var(--v2-muted)]">
              <Sparkles className="h-4 w-4" />
              Friendly on the surface. Strict underneath.
            </div>
          </section>

          <section className="flex items-center">
            <div className="w-full rounded-[32px] border border-[color:var(--v2-border)] bg-[rgba(255,253,248,0.92)] p-6 shadow-[0_18px_60px_rgba(31,31,27,0.08)] md:p-8 lg:p-10">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[color:var(--v2-accent-soft)] text-[color:var(--v2-accent)]">
                <KeyRound className="h-5 w-5" />
              </div>

              <div className="mt-5">
                <div className="text-2xl font-semibold tracking-[-0.04em]">Admin secret</div>
                <p className="v2-subtitle mt-2 max-w-md">
                  Use the current secret to continue.
                </p>
              </div>

              <div className="mt-8 space-y-4">
                <Input
                  type="password"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  placeholder="Paste the secret"
                  className="h-12 rounded-2xl border-[color:var(--v2-border)] bg-white/80 px-4 text-base shadow-none focus-visible:ring-[color:var(--v2-accent)]"
                />

                {input.errorMessage ? (
                  <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--v2-danger)_24%,white)] bg-[color:color-mix(in_srgb,var(--v2-danger)_8%,white)] px-4 py-3 text-sm text-[color:var(--v2-danger)]">
                    {input.errorMessage}
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-3 pt-2">
                  <Button
                    type="button"
                    className="h-11 rounded-full bg-[color:var(--v2-accent)] px-5 text-white hover:bg-[color:color-mix(in_srgb,var(--v2-accent)_88%,black)]"
                    onClick={() => input.onSave(value)}
                    disabled={!value.trim()}
                  >
                    Enter admin
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-11 rounded-full border border-[color:var(--v2-border)] bg-white/60 px-5 text-[color:var(--v2-text)] hover:bg-white"
                    onClick={() => {
                      setValue('');
                      input.onClear();
                    }}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
