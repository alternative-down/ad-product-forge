import { Link } from '@tanstack/react-router';

import { ThemeToggleButton } from '@/components/admin/theme-toggle-button';

export function AdminTopbar(input: {
  pathname: string;
  theme: 'light' | 'dark';
  onThemeToggle(): void;
}) {
  const homeActive = input.pathname === '/home';
  const integrationsActive = input.pathname.startsWith('/integrations');

  return (
    <div className="flex min-h-18 items-center justify-between gap-8 px-6 py-4">
      <div className="flex items-center gap-8">
        <div className="text-2xl font-semibold tracking-[-0.06em] sm:text-3xl">Forja</div>
        <nav className="flex items-center gap-4">
          <Link
            to="/home"
            className={homeActive ? 'text-sm font-medium text-foreground' : 'text-sm text-muted-foreground'}
          >
            Home
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
