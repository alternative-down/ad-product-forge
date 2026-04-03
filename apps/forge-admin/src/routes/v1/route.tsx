import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';

import '@/v1/styles/v1.css';
import { AppShell } from '@/v1/components/layout/app-shell';

export const Route = createFileRoute('/v1')({
  component: V1Route,
});

function V1Route() {
  useEffect(() => {
    document.body.classList.add('forge-admin-v1');

    return () => {
      document.body.classList.remove('forge-admin-v1');
      document.body.classList.remove('dark');
    };
  }, []);

  return <AppShell />;
}
