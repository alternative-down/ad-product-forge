import { createFileRoute } from '@tanstack/react-router';

import { AccessGate } from '@/components/admin/access-gate';
import { getStoredAdminSecret, setStoredAdminSecret } from '@/lib/admin-secret';

export const Route = createFileRoute('/')({
  component: AdminSecretRoute,
});

function AdminSecretRoute() {
  return (
    <AccessGate
      initialValue={getStoredAdminSecret()}
      onSave={(value) => {
        setStoredAdminSecret(value);
      }}
    />
  );
}
