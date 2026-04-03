import { useState } from 'react';
import { Menu } from 'lucide-react';
import { Link } from '@tanstack/react-router';

import { ThemeToggleButton } from '@/components/admin/theme-toggle-button';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

export function AdminTopbar(input: {
  pathname: string;
  theme: 'light' | 'dark';
  onThemeToggle(): void;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const homeActive = input.pathname === '/home';
  const agentsActive = input.pathname.startsWith('/agents');
  const integrationsActive = input.pathname.startsWith('/integrations');
  const financeActive = input.pathname.startsWith('/finance');

  return (
    <div className="flex min-h-18 items-center justify-between gap-4 px-6 py-4">
      <div className="flex min-w-0 items-center gap-4 md:gap-8">
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="md:hidden"
              />
            }
          >
            <Menu className="h-4 w-4" />
            <span className="sr-only">Abrir menu</span>
          </SheetTrigger>
          <SheetContent side="left">
            <SheetHeader>
              <SheetTitle>Forja</SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col gap-1 px-4 pb-4">
              <Link
                to="/home"
                onClick={() => setMobileMenuOpen(false)}
                className={homeActive ? 'rounded-sm bg-muted px-3 py-2 text-sm font-medium text-foreground' : 'rounded-sm px-3 py-2 text-sm text-muted-foreground'}
              >
                Home
              </Link>
              <Link
                to="/agents"
                onClick={() => setMobileMenuOpen(false)}
                className={agentsActive ? 'rounded-sm bg-muted px-3 py-2 text-sm font-medium text-foreground' : 'rounded-sm px-3 py-2 text-sm text-muted-foreground'}
              >
                Agentes
              </Link>
              <Link
                to="/finance"
                onClick={() => setMobileMenuOpen(false)}
                className={financeActive ? 'rounded-sm bg-muted px-3 py-2 text-sm font-medium text-foreground' : 'rounded-sm px-3 py-2 text-sm text-muted-foreground'}
              >
                Financeiro
              </Link>
              <Link
                to="/integrations"
                onClick={() => setMobileMenuOpen(false)}
                className={integrationsActive ? 'rounded-sm bg-muted px-3 py-2 text-sm font-medium text-foreground' : 'rounded-sm px-3 py-2 text-sm text-muted-foreground'}
              >
                Integrações
              </Link>
            </nav>
          </SheetContent>
        </Sheet>

        <div className="text-2xl font-semibold tracking-[-0.06em] sm:text-3xl">Forja</div>
        <nav className="hidden items-center gap-4 md:flex">
          <Link
            to="/home"
            className={homeActive ? 'text-sm font-medium text-foreground' : 'text-sm text-muted-foreground'}
          >
            Home
          </Link>
          <Link
            to="/agents"
            className={agentsActive ? 'text-sm font-medium text-foreground' : 'text-sm text-muted-foreground'}
          >
            Agentes
          </Link>
          <Link
            to="/finance"
            className={financeActive ? 'text-sm font-medium text-foreground' : 'text-sm text-muted-foreground'}
          >
            Financeiro
          </Link>
          <Link
            to="/integrations"
            className={integrationsActive ? 'text-sm font-medium text-foreground' : 'text-sm text-muted-foreground'}
          >
            Integrações
          </Link>
        </nav>
      </div>
      <ThemeToggleButton theme={input.theme} onToggle={input.onThemeToggle} />
    </div>
  );
}
