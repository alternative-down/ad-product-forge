import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import '../styles/app.css';
import { AccessGate } from '@/components/admin/access-gate';
import { validateAdminSecret } from '@/lib/admin-api';
import {
  getStoredAdminSecret,
  getStoredAdminTheme,
  setStoredAdminSecret,
  setStoredAdminTheme,
} from '@/lib/admin-secret';
import { applyAdminThemeToDocument, clearAdminThemeFromDocument } from '@/lib/admin-theme';

export const Route = createFileRoute('/')({
  component: AdminSecretRoute,
});

function AdminSecretRoute() {
  const navigate = useNavigate();
  const [theme, setTheme] = useState<'light' | 'dark'>(() => getStoredAdminTheme());
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setStoredAdminTheme(theme);
  }, [theme]);

  useEffect(() => {
    applyAdminThemeToDocument(theme);

    return () => {
      clearAdminThemeFromDocument();
    };
  }, [theme]);

  return (
    <AccessGate
      initialValue={getStoredAdminSecret()}
      warningMessage={warningMessage}
      submitting={submitting}
      theme={theme}
      onThemeToggle={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
      onSave={async (value) => {
        setSubmitting(true);
        setWarningMessage(null);
        try {
          const result = await validateAdminSecret(value);

          if (!result.valid) {
            setSubmitting(false);
            setWarningMessage(result.message);
            return;
          }

          setStoredAdminSecret(value);
          setSubmitting(false);
          await navigate({ to: '/home' });
        } catch {
          setSubmitting(false);
          setWarningMessage('Não foi possível validar a chave.');
        }
      }}
    />
  );
}
