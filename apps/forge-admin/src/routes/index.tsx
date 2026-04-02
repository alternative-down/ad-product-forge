import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

import '../styles/app.css';
import { AccessGate } from '@/components/admin/access-gate';
import { validateAdminSecret } from '@/lib/admin-api';
import { getStoredAdminSecret, setStoredAdminSecret } from '@/lib/admin-secret';

export const Route = createFileRoute('/')({
  component: AdminSecretRoute,
});

function AdminSecretRoute() {
  const navigate = useNavigate();
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  return (
    <AccessGate
      initialValue={getStoredAdminSecret()}
      warningMessage={warningMessage}
      submitting={submitting}
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
          await navigate({ to: '/v1' });
        } catch {
          setSubmitting(false);
          setWarningMessage('Não foi possível validar a chave.');
        }
      }}
      onForget={() => {
        setStoredAdminSecret('');
        setWarningMessage(null);
      }}
    />
  );
}
