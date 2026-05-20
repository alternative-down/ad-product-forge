import { Moon, Sun } from 'lucide-react';

import { Button } from '@/components/ui/button';

export function ThemeToggleButton(input: { theme: 'light' | 'dark'; onToggle(): void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={input.onToggle}
      aria-label="Alternar tema"
    >
      {input.theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
