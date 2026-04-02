import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { AccessGate } from '@/components/admin/access-gate';
import {
  getStoredAdminSecret,
  getStoredAdminTheme,
  setStoredAdminSecret,
  setStoredAdminTheme,
} from '@/lib/admin-secret';

export const Route = createFileRoute('/')({
  component: AdminSecretRoute,
});

function AdminSecretRoute() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => getStoredAdminTheme());
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    setStoredAdminTheme(theme);
  }, [theme]);

  return (
    <AccessGate
      initialValue={getStoredAdminSecret()}
      errorMessage={null}
      statusMessage={statusMessage}
      theme={theme}
      onThemeToggle={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
      onSave={(value) => {
        setStoredAdminSecret(value);
        setStatusMessage(value.trim() ? 'Secret saved on this browser.' : null);
      }}
      onClear={() => {
        setStoredAdminSecret('');
        setStatusMessage(null);
      }}
    />
  );
}
